import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListPlatforms = vi.fn()
const mockInstallFromPath = vi.fn()
const mockUninstall = vi.fn()

vi.mock('../../electron/plugins/PluginInstaller', () => ({
  PluginInstaller: class {
    scanInstalledPlugins = mockListPlatforms
    installFromPath = mockInstallFromPath
    uninstall = mockUninstall
  }
}))

const mockEnsureState = vi.fn()
const mockSetEnabled = vi.fn()
const mockUpdateSettings = vi.fn()
const mockGetSettings = vi.fn()
const mockSetLastError = vi.fn()
const mockDelete = vi.fn()
const mockRecordCallSuccess = vi.fn()
const mockRecordCallFailure = vi.fn()
const mockSetChecksum = vi.fn()
const mockResetCircuit = vi.fn()

vi.mock('../../electron/plugins/PluginStateStore', () => ({
  PluginStateStore: class {
    ensureState = mockEnsureState
    setEnabled = mockSetEnabled
    updateSettings = mockUpdateSettings
    get = mockGetSettings
    setLastError = mockSetLastError
    delete = mockDelete
    recordCallSuccess = mockRecordCallSuccess
    recordCallFailure = mockRecordCallFailure
    setChecksum = mockSetChecksum
    resetCircuit = mockResetCircuit
    list = vi.fn(() => ({}))
    upsert = vi.fn()
  }
}))

const mockHostCall = vi.fn()
const mockHostStop = vi.fn()
const mockHostDispose = vi.fn()

vi.mock('../../electron/plugins/ExternalPluginHost', () => ({
  ExternalPluginHost: class {
    call = mockHostCall
    stop = mockHostStop
    dispose = mockHostDispose
  }
}))

import { PluginCatalog } from '../../electron/plugins/PluginCatalog'
import type { ExternalPluginRegistration } from '../../electron/plugins/types'

function makeRegistration(
  platformId: string,
  overrides: Partial<ExternalPluginRegistration> = {}
): ExternalPluginRegistration {
  return {
    manifest: {
      manifestVersion: 1,
      id: `com.example.${platformId}`,
      name: `Plugin ${platformId}`,
      version: '1.0.0',
      platformId,
      source: 'external',
      runtime: 'external-host',
      entry: { main: 'index.mjs', module: 'esm' },
      capabilities: {
        search: true,
        songUrl: false,
        songDetail: false,
        lyric: false,
        playlistDetail: false,
        needsHydration: false,
        supportsLyricFetch: false,
        supportsUrlRefreshOnFailure: false
      }
    },
    installPath: `/plugins/${platformId}/1.0.0`,
    entryPath: `/plugins/${platformId}/1.0.0/index.mjs`,
    checksum: `sha256-${platformId}`,
    state: {
      pluginId: `com.example.${platformId}`,
      platformId,
      version: '1.0.0',
      installPath: `/plugins/${platformId}/1.0.0`,
      enabled: false,
      settings: {},
      storage: {},
      consecutiveFailures: 0,
      diagnostics: [],
      installedAt: 1000,
      updatedAt: 1000,
      ...overrides.state
    },
    ...overrides
  }
}

describe('electron/plugins/PluginCatalog', () => {
  let catalog: PluginCatalog

  beforeEach(() => {
    vi.clearAllMocks()
    mockListPlatforms.mockResolvedValue([])
    catalog = new PluginCatalog()
  })

  describe('listPlatforms', () => {
    it('returns core descriptor when no external plugins', async () => {
      const platforms = await catalog.listPlatforms()

      const ids = platforms.map(p => p.id)
      expect(ids).toContain('local')
      expect(ids).not.toContain('netease')
      expect(ids).not.toContain('qq')
    })

    it('includes external plugin descriptors', async () => {
      const reg = makeRegistration('kugou')
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)

      const platforms = await catalog.listPlatforms()

      const kugou = platforms.find(p => p.id === 'kugou')
      expect(kugou).toBeDefined()
      expect(kugou!.source).toBe('external')
    })
  })

  describe('installFromPath', () => {
    it('delegates to installer and state store, notifies listeners', async () => {
      const reg = makeRegistration('kugou')
      mockInstallFromPath.mockResolvedValue({
        manifest: reg.manifest,
        installPath: reg.installPath,
        entryPath: reg.entryPath,
        checksum: reg.checksum
      })
      mockEnsureState.mockReturnValue(reg.state)

      const listener = vi.fn()
      catalog.onDidChange(listener)

      const result = await catalog.installFromPath('/path/to/kugou')

      expect(mockInstallFromPath).toHaveBeenCalledWith('/path/to/kugou')
      expect(mockEnsureState).toHaveBeenCalled()
      expect(result.platforms).toBeDefined()
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('setEnabled', () => {
    it('disabling stops the host and notifies listeners', async () => {
      const reg = makeRegistration('kugou')
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)
      mockSetEnabled.mockReturnValue({ ...reg.state, enabled: false })

      await catalog.initialize()

      const listener = vi.fn()
      catalog.onDidChange(listener)

      await catalog.setEnabled('kugou', false)

      expect(mockHostStop).toHaveBeenCalledWith('kugou')
      expect(mockSetEnabled).toHaveBeenCalledWith('kugou', false)
      expect(listener).toHaveBeenCalled()
    })

    it('enabling updates state and notifies listeners', async () => {
      const reg = makeRegistration('kugou')
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)
      mockSetEnabled.mockReturnValue({ ...reg.state, enabled: true })

      await catalog.initialize()

      const listener = vi.fn()
      catalog.onDidChange(listener)

      await catalog.setEnabled('kugou', true)

      expect(mockSetEnabled).toHaveBeenCalledWith('kugou', true)
      expect(listener).toHaveBeenCalled()
    })

    it('throws for unknown platform', async () => {
      await expect(catalog.setEnabled('unknown', true)).rejects.toThrow(
        'External plugin platform not found'
      )
    })
  })

  describe('uninstall', () => {
    it('stops host, uninstalls, deletes state, notifies listeners', async () => {
      const reg = makeRegistration('kugou')
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)

      await catalog.initialize()

      const listener = vi.fn()
      catalog.onDidChange(listener)

      await catalog.uninstall('kugou')

      expect(mockHostStop).toHaveBeenCalledWith('kugou')
      expect(mockUninstall).toHaveBeenCalledWith('com.example.kugou')
      expect(mockDelete).toHaveBeenCalledWith('kugou')
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('getSettings', () => {
    it('returns settings from state', async () => {
      const reg = makeRegistration('kugou', {
        state: {
          ...makeRegistration('kugou').state,
          settings: { quality: '320' }
        }
      })
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)

      await catalog.initialize()

      const settings = await catalog.getSettings('kugou')
      expect(settings).toEqual({ quality: '320' })
    })
  })

  describe('updateSettings', () => {
    it('stops host, updates state, notifies listeners', async () => {
      const reg = makeRegistration('kugou')
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)
      mockUpdateSettings.mockReturnValue({ ...reg.state, settings: { quality: '320' } })

      await catalog.initialize()

      const listener = vi.fn()
      catalog.onDidChange(listener)

      const result = await catalog.updateSettings('kugou', { quality: '320' })

      expect(mockHostStop).toHaveBeenCalledWith('kugou')
      expect(mockUpdateSettings).toHaveBeenCalledWith('kugou', { quality: '320' })
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('call', () => {
    it('delegates to host and records success on success', async () => {
      const reg = makeRegistration('kugou', {
        state: {
          ...makeRegistration('kugou').state,
          enabled: true
        }
      })
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)
      mockHostCall.mockResolvedValue({ list: [], total: 0 })
      mockRecordCallSuccess.mockReturnValue({ ...reg.state, lastError: undefined })

      await catalog.initialize()

      const result = await catalog.call('kugou', 'search', { keyword: 'test' })

      expect(mockHostCall).toHaveBeenCalledWith(
        expect.objectContaining({ manifest: reg.manifest }),
        'search',
        { keyword: 'test' }
      )
      expect(mockRecordCallSuccess).toHaveBeenCalledWith('kugou')
    })

    it('records failure on failure', async () => {
      const reg = makeRegistration('kugou', {
        state: {
          ...makeRegistration('kugou').state,
          enabled: true
        }
      })
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)
      mockHostCall.mockRejectedValue(new Error('timeout'))
      mockRecordCallFailure.mockReturnValue({
        ...reg.state,
        consecutiveFailures: 1,
        lastError: 'timeout'
      })

      await catalog.initialize()

      await expect(catalog.call('kugou', 'search', { keyword: 'test' })).rejects.toThrow('timeout')
      expect(mockRecordCallFailure).toHaveBeenCalledWith('kugou', 'search', 'timeout')
    })

    it('throws if platform is disabled', async () => {
      const reg = makeRegistration('kugou', {
        state: {
          ...makeRegistration('kugou').state,
          enabled: false
        }
      })
      mockListPlatforms.mockResolvedValue([reg])
      mockEnsureState.mockReturnValue(reg.state)

      await catalog.initialize()

      await expect(catalog.call('kugou', 'search', {})).rejects.toThrow('disabled')
    })
  })

  describe('onDidChange', () => {
    it('receives notifications and can be unsubscribed', async () => {
      const listener = vi.fn()
      const unsubscribe = catalog.onDidChange(listener)

      const reg = makeRegistration('kugou')
      mockInstallFromPath.mockResolvedValue({
        manifest: reg.manifest,
        installPath: reg.installPath,
        entryPath: reg.entryPath,
        checksum: reg.checksum
      })
      mockEnsureState.mockReturnValue(reg.state)

      await catalog.installFromPath('/path/to/kugou')
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      // Another mutation should not notify
      listener.mockClear()
      await catalog.installFromPath('/path/to/kugou2')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('disposes the host', async () => {
      await catalog.dispose()
      expect(mockHostDispose).toHaveBeenCalled()
    })
  })
})
