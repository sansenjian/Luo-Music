import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDescriptor } from '@shared/types/platform'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockGetPlatformDescriptors = vi.hoisted(() => vi.fn<() => PlatformDescriptor[]>())
const mockReplaceRuntimePlatformDescriptors = vi.hoisted(() =>
  vi.fn<(descs: PlatformDescriptor[]) => void>()
)
const experimentalFeaturesMock = vi.hoisted(() => {
  const smtcEnabled = { value: false }
  const coverSwipeEnabled = { value: false }

  return {
    smtcEnabled,
    coverSwipeEnabled,
    setSMTCEnabled: vi.fn((next: boolean) => {
      smtcEnabled.value = next
    }),
    setCoverSwipeEnabled: vi.fn((next: boolean) => {
      coverSwipeEnabled.value = next
    })
  }
})
const themeResourcePacksMock = vi.hoisted(() => {
  const enabledThemeResourcePackIds = { value: [] as string[] }

  return {
    enabledThemeResourcePackIds,
    isThemeResourcePackEnabled: vi.fn((themeResourcePackId: string) =>
      enabledThemeResourcePackIds.value.includes(themeResourcePackId)
    ),
    setThemeResourcePackEnabled: vi.fn((themeResourcePackId: string, next: boolean) => {
      const enabledIds = new Set(enabledThemeResourcePackIds.value)

      if (next) {
        enabledIds.add(themeResourcePackId)
      } else {
        enabledIds.delete(themeResourcePackId)
      }

      enabledThemeResourcePackIds.value = Array.from(enabledIds)
    })
  }
})
const renderStyleMock = vi.hoisted(() => {
  const renderStyle = { value: 'classic' as string }

  return {
    renderStyle,
    setRenderStyle: vi.fn((next: string) => {
      renderStyle.value = next
    }),
    ensureAvailableRenderStyle: vi.fn()
  }
})

vi.mock('@/platform/music/descriptors', () => ({
  getPlatformDescriptors: mockGetPlatformDescriptors,
  replaceRuntimePlatformDescriptors: mockReplaceRuntimePlatformDescriptors
}))

vi.mock('@/composables/useExperimentalFeatures', () => ({
  useExperimentalFeatures: () => experimentalFeaturesMock
}))

vi.mock('@/composables/useProjectUi', () => ({
  useProjectUi: () => renderStyleMock
}))

vi.mock('@/composables/useThemeResourcePacks', () => ({
  useThemeResourcePacks: () => themeResourcePacksMock
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

function expectFirstPartyExtensionDescriptors(
  platforms: PlatformDescriptor[],
  options: {
    smtc?: boolean
    coverSwipeEnabled?: boolean
    smtcEnabled?: boolean
    brandThemeResourceEnabled?: boolean
  } = {}
): void {
  expect(platforms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'builtin.cover-swipe',
        displayName: '滑动封面切歌',
        source: 'builtin',
        runtime: 'local',
        category: 'extension',
        enabled: options.coverSwipeEnabled ?? false,
        status: options.coverSwipeEnabled ? 'ready' : 'disabled'
      }),
      expect.objectContaining({
        id: 'builtin.brand-theme',
        displayName: '品牌风格',
        source: 'builtin',
        runtime: 'local',
        category: 'theme',
        enabled: options.brandThemeResourceEnabled ?? false,
        status: options.brandThemeResourceEnabled ? 'ready' : 'disabled'
      })
    ])
  )

  const smtcDescriptor = platforms.find(platform => platform.id === 'builtin.smtc')
  const smtcDescriptorSummary = smtcDescriptor
    ? {
        id: smtcDescriptor.id,
        displayName: smtcDescriptor.displayName,
        source: smtcDescriptor.source,
        runtime: smtcDescriptor.runtime,
        category: smtcDescriptor.category,
        enabled: smtcDescriptor.enabled,
        status: smtcDescriptor.status
      }
    : undefined
  const expectedSmtcDescriptor =
    options.smtc === false
      ? undefined
      : {
          id: 'builtin.smtc',
          displayName: 'Windows SMTC',
          source: 'builtin',
          runtime: 'local',
          category: 'extension',
          enabled: options.smtcEnabled ?? false,
          status: options.smtcEnabled ? 'ready' : 'disabled'
        }

  expect(smtcDescriptorSummary).toEqual(expectedSmtcDescriptor)
}

function expectExternalPluginDescriptor(platforms: PlatformDescriptor[]): void {
  expect(platforms).toEqual(expect.arrayContaining([pluginDescriptor]))
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
    experimentalFeaturesMock.smtcEnabled.value = false
    experimentalFeaturesMock.coverSwipeEnabled.value = false
    themeResourcePacksMock.enabledThemeResourcePackIds.value = []
    renderStyleMock.renderStyle.value = 'classic'
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
    expect(result).toEqual(expect.arrayContaining(builtinDescriptors))
    expectFirstPartyExtensionDescriptors(result, { smtc: false })
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
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.arrayContaining([pluginDescriptor])
    )
    expectExternalPluginDescriptor(result)
    expectFirstPartyExtensionDescriptors(result)
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
    expect(result).toEqual(expect.arrayContaining(builtinDescriptors))
    expectFirstPartyExtensionDescriptors(result)
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
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.arrayContaining([pluginDescriptor])
    )
    expectExternalPluginDescriptor(result)
    expectFirstPartyExtensionDescriptors(result)
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
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.arrayContaining([pluginDescriptor])
    )
    expectExternalPluginDescriptor(result)
    expectFirstPartyExtensionDescriptors(result)
  })

  it('toggles the first-party SMTC extension without delegating to the bridge', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    await vi.waitFor(() => expect(bridge.list).toHaveBeenCalled())
    bridge.setEnabled.mockClear()

    const result = await service.setEnabled('builtin.smtc', true)

    expect(experimentalFeaturesMock.setSMTCEnabled).toHaveBeenCalledWith(true)
    expect(bridge.setEnabled).not.toHaveBeenCalled()
    expectExternalPluginDescriptor(result)
    expectFirstPartyExtensionDescriptors(result, { smtcEnabled: true })
  })

  it('toggles the first-party cover swipe extension outside Electron', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const result = await service.setEnabled('builtin.cover-swipe', true)

    expect(experimentalFeaturesMock.setCoverSwipeEnabled).toHaveBeenCalledWith(true)
    expect(result).toEqual(expect.arrayContaining(builtinDescriptors))
    expectFirstPartyExtensionDescriptors(result, { smtc: false, coverSwipeEnabled: true })
  })

  it('toggles the first-party brand theme outside Electron', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const enabledResult = await service.setEnabled('builtin.brand-theme', true)

    expect(themeResourcePacksMock.setThemeResourcePackEnabled).toHaveBeenCalledWith(
      'builtin.brand-theme',
      true
    )
    expect(renderStyleMock.setRenderStyle).not.toHaveBeenCalled()
    expect(enabledResult).toEqual(expect.arrayContaining(builtinDescriptors))
    expectFirstPartyExtensionDescriptors(enabledResult, {
      smtc: false,
      brandThemeResourceEnabled: true
    })

    const disabledResult = await service.setEnabled('builtin.brand-theme', false)

    expect(themeResourcePacksMock.setThemeResourcePackEnabled).toHaveBeenCalledWith(
      'builtin.brand-theme',
      false
    )
    expect(renderStyleMock.setRenderStyle).not.toHaveBeenCalled()
    expectFirstPartyExtensionDescriptors(disabledResult, { smtc: false })
  })

  it('falls back to the classic render style when disabling the active brand theme', async () => {
    themeResourcePacksMock.enabledThemeResourcePackIds.value = ['builtin.brand-theme']
    renderStyleMock.renderStyle.value = 'brand'
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const result = await service.setEnabled('builtin.brand-theme', false)

    expect(themeResourcePacksMock.setThemeResourcePackEnabled).toHaveBeenCalledWith(
      'builtin.brand-theme',
      false
    )
    expect(renderStyleMock.setRenderStyle).toHaveBeenCalledWith('classic')
    expectFirstPartyExtensionDescriptors(result, { smtc: false })
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
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.not.arrayContaining([pluginDescriptor])
    )
    expect(result.some(platform => platform.id === pluginDescriptor.id)).toBe(false)
    expectFirstPartyExtensionDescriptors(result)
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

  it('reads and normalizes plugin auth state through the bridge', async () => {
    const bridge = createBridge()
    bridge.call.mockResolvedValueOnce({
      platform: 'plugin-x',
      status: 'authenticated',
      account: {
        id: 'user-1',
        nickname: 'Plugin User'
      },
      message: 'ok'
    })
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.getAuthState('plugin-x')

    expect(bridge.call).toHaveBeenCalledWith('plugin-x', 'auth.getState', {})
    expect(result).toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'authenticated',
        account: expect.objectContaining({
          id: 'user-1',
          nickname: 'Plugin User'
        }),
        message: 'ok',
        updatedAt: expect.any(Number)
      })
    )
  })

  it('returns anonymous plugin auth state when the bridge is unavailable', async () => {
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => false
    })

    const result = await service.getAuthState('plugin-x')

    expect(result).toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'anonymous',
        message: '未登录',
        updatedAt: expect.any(Number)
      })
    )
  })

  it('returns anonymous auth state for first-party plugins without bridge calls', async () => {
    const bridge = createBridge()
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.getAuthState('builtin.smtc')

    expect(bridge.call).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        platform: 'builtin.smtc',
        status: 'anonymous'
      })
    )
  })

  it('returns error auth state when the plugin auth state call fails', async () => {
    const bridge = createBridge()
    bridge.call.mockRejectedValueOnce(new Error('missing method'))
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.getAuthState('plugin-x')

    expect(result).toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'error',
        message: '登录状态读取失败',
        updatedAt: expect.any(Number)
      })
    )
  })

  it('starts plugin login through the auth facade and normalizes challenges', async () => {
    const bridge = createBridge()
    bridge.call.mockResolvedValueOnce({
      challengeId: 'challenge-1',
      type: 'qr',
      title: 'Plugin Login',
      statusText: 'scan',
      qrImageUrl: 'https://example.com/qr.png',
      pollIntervalMs: 500
    })
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const result = await service.auth.startLogin('plugin-x', { mode: 'qr' })

    expect(bridge.call).toHaveBeenCalledWith('plugin-x', 'auth.startLogin', { mode: 'qr' })
    expect(result).toEqual({
      challengeId: 'challenge-1',
      type: 'qr',
      title: 'Plugin Login',
      statusText: 'scan',
      qrImageUrl: 'https://example.com/qr.png',
      pollIntervalMs: 500
    })
  })

  it('polls, submits, refreshes, logs out, and cancels plugin auth through the auth facade', async () => {
    const bridge = createBridge()
    bridge.call
      .mockResolvedValueOnce({
        platform: 'plugin-x',
        status: 'pending',
        message: 'waiting'
      })
      .mockResolvedValueOnce({
        platform: 'plugin-x',
        status: 'authenticated',
        account: {
          id: 'user-1',
          nickname: 'Plugin User'
        }
      })
      .mockResolvedValueOnce({
        platform: 'plugin-x',
        status: 'authenticated'
      })
      .mockResolvedValueOnce({
        platform: 'plugin-x',
        status: 'anonymous'
      })
      .mockResolvedValueOnce(undefined)
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    await expect(service.auth.pollLogin('plugin-x', 'challenge-1')).resolves.toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'pending',
        message: 'waiting'
      })
    )
    await expect(
      service.auth.submitLogin('plugin-x', 'challenge-1', { username: 'u' })
    ).resolves.toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'authenticated'
      })
    )
    await expect(service.auth.refresh('plugin-x')).resolves.toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'authenticated'
      })
    )
    await expect(service.auth.logout('plugin-x')).resolves.toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'anonymous'
      })
    )
    await expect(service.auth.cancelLogin('plugin-x', 'challenge-1')).resolves.toBeUndefined()

    expect(bridge.call).toHaveBeenNthCalledWith(1, 'plugin-x', 'auth.pollLogin', {
      challengeId: 'challenge-1'
    })
    expect(bridge.call).toHaveBeenNthCalledWith(2, 'plugin-x', 'auth.submitLogin', {
      challengeId: 'challenge-1',
      values: { username: 'u' }
    })
    expect(bridge.call).toHaveBeenNthCalledWith(3, 'plugin-x', 'auth.refresh', {})
    expect(bridge.call).toHaveBeenNthCalledWith(4, 'plugin-x', 'auth.logout', {})
    expect(bridge.call).toHaveBeenNthCalledWith(5, 'plugin-x', 'auth.cancelLogin', {
      challengeId: 'challenge-1'
    })
  })

  it('imports a standardized auth session through the auth facade', async () => {
    const bridge = createBridge()
    bridge.call.mockResolvedValueOnce({
      platform: 'plugin-x',
      status: 'authenticated',
      account: {
        id: 'user-1',
        nickname: 'Plugin User'
      },
      message: '登录会话已导入'
    })
    const { createPluginService } = await import('@/services/pluginService')
    const service = createPluginService({
      isElectron: () => true,
      getPluginBridge: () => bridge
    })

    const session = {
      credential: {
        type: 'cookie' as const,
        value: 'SESSION=legacy'
      },
      account: {
        id: 'user-1',
        nickname: 'Plugin User'
      }
    }

    await expect(service.auth.importSession('plugin-x', session)).resolves.toEqual(
      expect.objectContaining({
        platform: 'plugin-x',
        status: 'authenticated',
        account: expect.objectContaining({
          id: 'user-1',
          nickname: 'Plugin User'
        })
      })
    )

    expect(bridge.call).toHaveBeenCalledWith('plugin-x', 'auth.importSession', { session })
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

    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([pluginDescriptor]))
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.arrayContaining([pluginDescriptor])
    )
    const receivedPlatforms = listener.mock.calls[0]?.[0] as PlatformDescriptor[]
    expectFirstPartyExtensionDescriptors(receivedPlatforms)

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
    expect(mockReplaceRuntimePlatformDescriptors).toHaveBeenCalledWith(
      expect.arrayContaining([pluginDescriptor])
    )
    expectExternalPluginDescriptor(result)
    expectFirstPartyExtensionDescriptors(result)
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
