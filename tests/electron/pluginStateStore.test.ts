import { describe, it, expect, vi, beforeEach } from 'vitest'

function createMockStore() {
  const data: Record<string, unknown> = { pluginState: {} }

  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value
    }),
    _data: data
  }
}

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown>
      constructor(options: { defaults: Record<string, unknown> }) {
        this.data = { ...options.defaults }
      }
      get(key: string) {
        return this.data[key]
      }
      set(key: string, value: unknown) {
        this.data[key] = value
      }
    }
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userData')
  }
}))

import { PluginStateStore } from '../../electron/plugins/PluginStateStore'
import type { ExternalPluginManifest } from '../../electron/plugins/types'

function makeManifest(overrides: Partial<ExternalPluginManifest> = {}): ExternalPluginManifest {
  return {
    manifestVersion: 1,
    id: 'com.example.test',
    name: 'Test Plugin',
    version: '1.0.0',
    platformId: 'test',
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
    },
    ...overrides
  }
}

describe('electron/plugins/PluginStateStore', () => {
  let store: PluginStateStore
  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore = createMockStore()
    store = new PluginStateStore({ store: mockStore as never })
  })

  describe('upsert', () => {
    it('creates a new state record', () => {
      const record = store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/external/com.example.test/1.0.0',
        enabled: false,
        settings: { maxResults: 10 },
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      expect(record.pluginId).toBe('com.example.test')
      expect(record.platformId).toBe('test')
      expect(record.settings).toEqual({ maxResults: 10 })
    })

    it('overwrites an existing record', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/external/com.example.test/1.0.0',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const updated = store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/external/com.example.test/1.0.0',
        enabled: true,
        settings: { verbose: true },
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 2000
      })

      expect(updated.enabled).toBe(true)
      expect(updated.settings).toEqual({ verbose: true })
    })
  })

  describe('get', () => {
    it('returns undefined for unknown platform', () => {
      expect(store.get('unknown')).toBeUndefined()
    })

    it('returns record for known platform', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/external/com.example.test/1.0.0',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      expect(store.get('test')).toBeDefined()
      expect(store.get('test')!.pluginId).toBe('com.example.test')
    })
  })

  describe('list', () => {
    it('returns all state records', () => {
      store.upsert({
        pluginId: 'com.example.a',
        platformId: 'a',
        version: '1.0.0',
        installPath: '/a',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })
      store.upsert({
        pluginId: 'com.example.b',
        platformId: 'b',
        version: '1.0.0',
        installPath: '/b',
        enabled: true,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const list = store.list()
      expect(Object.keys(list)).toHaveLength(2)
      expect(list.a).toBeDefined()
      expect(list.b).toBeDefined()
    })
  })

  describe('ensureState', () => {
    it('creates new state with default settings from manifest', () => {
      const manifest = makeManifest({
        contributions: {
          settings: [
            {
              key: 'quality',
              type: 'select',
              label: 'Quality',
              default: '128',
              options: [{ value: '128', label: '128kbps' }]
            },
            { key: 'verbose', type: 'boolean', label: 'Verbose' }
          ]
        }
      })

      const state = store.ensureState(manifest, '/plugins/test/1.0.0')

      expect(state.pluginId).toBe('com.example.test')
      expect(state.platformId).toBe('test')
      expect(state.enabled).toBe(false)
      expect(state.settings).toEqual({ quality: '128' })
      expect(state.installPath).toBe('/plugins/test/1.0.0')
    })

    it('preserves existing enabled and settings when re-ensuring', () => {
      const manifest = makeManifest({
        contributions: {
          settings: [
            {
              key: 'quality',
              type: 'select',
              label: 'Quality',
              default: '128',
              options: [{ value: '128', label: '128kbps' }]
            }
          ]
        }
      })

      const first = store.ensureState(manifest, '/plugins/test/1.0.0')
      store.setEnabled('test', true)
      store.updateSettings('test', { quality: '320' })

      const second = store.ensureState(manifest, '/plugins/test/2.0.0')

      expect(second.enabled).toBe(true)
      expect(second.settings.quality).toBe('320')
      expect(second.version).toBe('1.0.0') // version from the original record
      expect(second.installPath).toBe('/plugins/test/2.0.0')
    })
  })

  describe('setEnabled', () => {
    it('toggles enabled flag', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const enabled = store.setEnabled('test', true)
      expect(enabled.enabled).toBe(true)

      const disabled = store.setEnabled('test', false)
      expect(disabled.enabled).toBe(false)
    })

    it('throws for unknown platform', () => {
      expect(() => store.setEnabled('unknown', true)).toThrow('Plugin state not found')
    })
  })

  describe('updateSettings', () => {
    it('merges settings', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: false,
        settings: { a: 1, b: 2 },
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const updated = store.updateSettings('test', { b: 3, c: 4 })
      expect(updated.settings).toEqual({ a: 1, b: 3, c: 4 })
    })
  })

  describe('replaceSettings', () => {
    it('replaces all settings', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: false,
        settings: { a: 1, b: 2 },
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const replaced = store.replaceSettings('test', { x: 10 })
      expect(replaced.settings).toEqual({ x: 10 })
    })
  })

  describe('setLastError', () => {
    it('sets an error message', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: true,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const withError = store.setLastError('test', 'Something failed')
      expect(withError.lastError).toBe('Something failed')
    })

    it('clears an error', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: true,
        settings: {},
        storage: {},
        lastError: 'old error',
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      const cleared = store.setLastError('test', undefined)
      expect(cleared.lastError).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('removes state record', () => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })

      expect(store.get('test')).toBeDefined()
      store.delete('test')
      expect(store.get('test')).toBeUndefined()
    })
  })

  describe('storage operations', () => {
    beforeEach(() => {
      store.upsert({
        pluginId: 'com.example.test',
        platformId: 'test',
        version: '1.0.0',
        installPath: '/plugins/test/1.0.0',
        enabled: false,
        settings: {},
        storage: {},
        consecutiveFailures: 0,
        diagnostics: [],
        installedAt: 1000,
        updatedAt: 1000
      })
    })

    it('getStorageValue returns undefined for missing key', () => {
      expect(store.getStorageValue('test', 'missing')).toBeUndefined()
    })

    it('setStorageValue and getStorageValue work', () => {
      store.setStorageValue('test', 'count', 42)
      expect(store.getStorageValue('test', 'count')).toBe(42)
    })

    it('removeStorageValue deletes a key', () => {
      store.setStorageValue('test', 'count', 42)
      store.removeStorageValue('test', 'count')
      expect(store.getStorageValue('test', 'count')).toBeUndefined()
    })

    it('clearStorage removes all storage keys', () => {
      store.setStorageValue('test', 'a', 1)
      store.setStorageValue('test', 'b', 2)
      store.clearStorage('test')
      expect(store.getStorageValue('test', 'a')).toBeUndefined()
      expect(store.getStorageValue('test', 'b')).toBeUndefined()
    })

    it('throws for unknown platform', () => {
      expect(() => store.getStorageValue('unknown', 'key')).toThrow('Plugin state not found')
    })
  })
})
