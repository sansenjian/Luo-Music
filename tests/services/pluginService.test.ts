import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDescriptor } from '@/platform/music/descriptors'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockGetPlatformDescriptors = vi.hoisted(() => vi.fn<() => PlatformDescriptor[]>())
const mockReplaceRuntimePlatformDescriptors = vi.hoisted(() =>
  vi.fn<(descs: PlatformDescriptor[]) => void>()
)

vi.mock('@/platform/music/descriptors', () => ({
  getPlatformDescriptors: mockGetPlatformDescriptors,
  replaceRuntimePlatformDescriptors: mockReplaceRuntimePlatformDescriptors
}))

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const builtinDescriptors: PlatformDescriptor[] = [
  {
    id: 'netease',
    displayName: 'Netease',
    source: 'builtin',
    runtime: 'local',
    enabled: true,
    capabilities: {
      search: true,
      songUrl: true,
      songDetail: true,
      lyric: true,
      playlistDetail: true,
      needsHydration: false,
      supportsLyricFetch: false,
      supportsUrlRefreshOnFailure: false
    }
  },
  {
    id: 'qq',
    displayName: 'QQ Music',
    source: 'builtin',
    runtime: 'local',
    enabled: true,
    capabilities: {
      search: true,
      songUrl: true,
      songDetail: true,
      lyric: true,
      playlistDetail: true,
      needsHydration: false,
      supportsLyricFetch: false,
      supportsUrlRefreshOnFailure: false
    }
  }
]

const pluginDescriptor: PlatformDescriptor = {
  id: 'plugin-x',
  displayName: 'Plugin X',
  source: 'external',
  runtime: 'external-host',
  enabled: true,
  capabilities: {
    search: true,
    songUrl: true,
    songDetail: false,
    lyric: false,
    playlistDetail: false,
    needsHydration: false,
    supportsLyricFetch: false,
    supportsUrlRefreshOnFailure: false
  }
}

function createBridge() {
  return {
    list: vi.fn<() => Promise<PlatformDescriptor[]>>(() => Promise.resolve([pluginDescriptor])),
    installFromPath: vi.fn<(p: string) => Promise<PlatformDescriptor[]>>(() =>
      Promise.resolve([pluginDescriptor])
    ),
    pickInstallPath: vi.fn<() => Promise<string | null>>(() => Promise.resolve('/path/to/plugin')),
    setEnabled: vi.fn<(id: string, e: boolean) => Promise<PlatformDescriptor[]>>(() =>
      Promise.resolve([pluginDescriptor])
    ),
    uninstall: vi.fn<(id: string) => Promise<PlatformDescriptor[]>>(() => Promise.resolve([])),
    getSettings: vi.fn<(id: string) => Promise<Record<string, unknown>>>(() =>
      Promise.resolve({ key: 'value' })
    ),
    updateSettings: vi.fn<
      (id: string, s: Record<string, unknown>) => Promise<Record<string, unknown>>
    >(() => Promise.resolve({ key: 'updated' })),
    call: vi.fn<(id: string, m: string, p: unknown) => Promise<unknown>>(() =>
      Promise.resolve('result')
    ),
    onChanged: vi.fn<(l: (p: PlatformDescriptor[]) => void) => () => void>(() => () => {})
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPluginService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPlatformDescriptors.mockReturnValue(builtinDescriptors)
    mockReplaceRuntimePlatformDescriptors.mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. Non-Electron: listPlatforms returns built-in descriptors
  // -----------------------------------------------------------------------
  it('returns built-in descriptors via getPlatformDescriptors in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const result = await service.listPlatforms()

    expect(mockGetPlatformDescriptors).toHaveBeenCalled()
    expect(result).toEqual(builtinDescriptors)
    expect(mockReplaceRuntimePlatformDescriptors).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 2. Electron with bridge: listPlatforms calls bridge.list() and syncs
  // -----------------------------------------------------------------------
  it('calls bridge.list() and syncs descriptors in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    // Wait for the auto-refresh triggered during construction to settle
    await vi.waitFor(() => expect(bridge.list).toHaveBeenCalled())

    const result = await service.listPlatforms()

    // bridge.list is called once by auto-refresh + once by explicit listPlatforms
    expect(bridge.list).toHaveBeenCalledTimes(2)
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([pluginDescriptor])
    expect(result).toEqual([pluginDescriptor])
  })

  // -----------------------------------------------------------------------
  // Electron mode without bridge falls back to built-in
  // -----------------------------------------------------------------------
  it('falls back to built-in descriptors in Electron mode when bridge is unavailable', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    const result = await service.listPlatforms()

    expect(mockGetPlatformDescriptors).toHaveBeenCalled()
    expect(result).toEqual(builtinDescriptors)
  })

  // -----------------------------------------------------------------------
  // 3. installFromPath throws in non-Electron mode
  // -----------------------------------------------------------------------
  it('throws when installFromPath is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.installFromPath('/some/plugin')).rejects.toThrow(
      'Plugin installation is only available in Electron'
    )
  })

  // -----------------------------------------------------------------------
  // 4. installFromPath calls bridge and syncs in Electron mode
  // -----------------------------------------------------------------------
  it('calls bridge.installFromPath and syncs descriptors in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.installFromPath('/path/to/plugin')

    expect(bridge.installFromPath).toHaveBeenCalledWith('/path/to/plugin')
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([pluginDescriptor])
    expect(result).toEqual([pluginDescriptor])
  })

  // -----------------------------------------------------------------------
  // 5. pickInstallPath throws in non-Electron mode
  // -----------------------------------------------------------------------
  it('throws when pickInstallPath is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.pickInstallPath()).rejects.toThrow(
      'Plugin installation is only available in Electron'
    )
  })

  // -----------------------------------------------------------------------
  // 6. pickInstallPath returns bridge result in Electron mode
  // -----------------------------------------------------------------------
  it('returns bridge.pickInstallPath result in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.pickInstallPath()

    expect(bridge.pickInstallPath).toHaveBeenCalledOnce()
    expect(result).toBe('/path/to/plugin')
  })

  it('returns null when bridge.pickInstallPath resolves to null', async () => {
    const bridge = createBridge()
    bridge.pickInstallPath.mockResolvedValue(null)

    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.pickInstallPath()
    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // 7. setEnabled throws in non-Electron, delegates in Electron
  // -----------------------------------------------------------------------
  it('throws when setEnabled is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.setEnabled('plugin-x', false)).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('calls bridge.setEnabled and syncs descriptors in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.setEnabled('plugin-x', false)

    expect(bridge.setEnabled).toHaveBeenCalledWith('plugin-x', false)
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([pluginDescriptor])
    expect(result).toEqual([pluginDescriptor])
  })

  // -----------------------------------------------------------------------
  // 8. uninstall throws in non-Electron, delegates in Electron
  // -----------------------------------------------------------------------
  it('throws when uninstall is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.uninstall('plugin-x')).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('calls bridge.uninstall and syncs descriptors in Electron mode', async () => {
    const bridge = createBridge()
    bridge.uninstall.mockResolvedValue([])

    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.uninstall('plugin-x')

    expect(bridge.uninstall).toHaveBeenCalledWith('plugin-x')
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([])
    expect(result).toEqual([])
  })

  // -----------------------------------------------------------------------
  // 9. getSettings returns {} in non-Electron, delegates in Electron
  // -----------------------------------------------------------------------
  it('returns empty object when getSettings is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const result = await service.getSettings('plugin-x')
    expect(result).toEqual({})
  })

  it('delegates to bridge.getSettings in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.getSettings('plugin-x')

    expect(bridge.getSettings).toHaveBeenCalledWith('plugin-x')
    expect(result).toEqual({ key: 'value' })
  })

  // -----------------------------------------------------------------------
  // 10. updateSettings throws in non-Electron, refreshes descriptors after
  // -----------------------------------------------------------------------
  it('throws when updateSettings is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.updateSettings('plugin-x', { key: 'new' })).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('calls bridge.updateSettings, then refreshes platform descriptors', async () => {
    const bridge = createBridge()
    const updatedSettings = { key: 'updated' }
    bridge.updateSettings.mockResolvedValue(updatedSettings)
    // After updateSettings the service calls refreshPlatformDescriptors -> listPlatforms -> bridge.list
    bridge.list.mockResolvedValue([pluginDescriptor])

    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.updateSettings('plugin-x', { key: 'new' })

    expect(bridge.updateSettings).toHaveBeenCalledWith('plugin-x', { key: 'new' })
    // The refresh after update should call bridge.list again
    expect(bridge.list).toHaveBeenCalled()
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalled()
    expect(result).toEqual(updatedSettings)
  })

  // -----------------------------------------------------------------------
  // 11. call throws in non-Electron, delegates in Electron
  // -----------------------------------------------------------------------
  it('throws when call is called in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    await expect(service.call('plugin-x', 'search', { q: 'test' })).rejects.toThrow(
      'External plugin calls are only available in Electron'
    )
  })

  it('delegates to bridge.call in Electron mode', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const payload = { q: 'test' }
    const result = await service.call('plugin-x', 'search', payload)

    expect(bridge.call).toHaveBeenCalledWith('plugin-x', 'search', payload)
    expect(result).toBe('result')
  })

  // -----------------------------------------------------------------------
  // 12. onPlatformsChanged returns noop in non-Electron, subscribes in Electron
  // -----------------------------------------------------------------------
  it('returns a noop unsubscribe in non-Electron mode', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const unsubscribe = service.onPlatformsChanged(() => {})
    // Should return a function without errors
    expect(typeof unsubscribe).toBe('function')
    // Calling it should not throw
    expect(() => unsubscribe()).not.toThrow()
  })

  it('subscribes via bridge.onChanged in Electron mode and syncs received platforms', async () => {
    let capturedListener: ((platforms: PlatformDescriptor[]) => void) | undefined
    const bridgeUnsubscribe = vi.fn()
    const bridge = createBridge()
    bridge.onChanged.mockImplementation((listener: (platforms: PlatformDescriptor[]) => void) => {
      capturedListener = listener
      return bridgeUnsubscribe
    })

    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const listener = vi.fn()
    const unsubscribe = service.onPlatformsChanged(listener)

    expect(bridge.onChanged).toHaveBeenCalledOnce()
    expect(typeof unsubscribe).toBe('function')

    // Simulate bridge emitting a change
    mockReplaceRuntimePlatformDescriptors.mockClear()
    expect(capturedListener).toBeDefined()
    capturedListener!([pluginDescriptor])

    expect(listener).toHaveBeenCalledWith([pluginDescriptor])
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([pluginDescriptor])

    // Unsubscribe should call the bridge's unsubscribe
    unsubscribe()
    expect(bridgeUnsubscribe).toHaveBeenCalledOnce()
  })

  // -----------------------------------------------------------------------
  // refreshPlatformDescriptors delegates to listPlatforms
  // -----------------------------------------------------------------------
  it('refreshPlatformDescriptors delegates to listPlatforms', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    // Wait for the auto-refresh triggered during construction to settle
    await vi.waitFor(() => expect(bridge.list).toHaveBeenCalled())
    bridge.list.mockClear()

    const result = await service.refreshPlatformDescriptors()

    expect(bridge.list).toHaveBeenCalledOnce()
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith([pluginDescriptor])
    expect(result).toEqual([pluginDescriptor])
  })

  // -----------------------------------------------------------------------
  // Edge: Electron mode without bridge for methods that require it
  // -----------------------------------------------------------------------
  it('throws installFromPath in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.installFromPath('/path')).rejects.toThrow(
      'Plugin installation is only available in Electron'
    )
  })

  it('throws pickInstallPath in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.pickInstallPath()).rejects.toThrow(
      'Plugin installation is only available in Electron'
    )
  })

  it('throws setEnabled in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.setEnabled('x', true)).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('throws uninstall in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.uninstall('x')).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('returns {} from getSettings in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    const result = await service.getSettings('x')
    expect(result).toEqual({})
  })

  it('throws updateSettings in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.updateSettings('x', {})).rejects.toThrow(
      'Plugin management is only available in Electron'
    )
  })

  it('throws call in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    await expect(service.call('x', 'method', null)).rejects.toThrow(
      'External plugin calls are only available in Electron'
    )
  })

  it('returns noop unsubscribe from onPlatformsChanged in Electron mode without bridge', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => undefined
    })

    const unsubscribe = service.onPlatformsChanged(() => {})
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })
})
