import { app } from 'electron'
import type { ExternalPluginManifest, PluginStateRecord } from './types'

interface StoreLike {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

function getDefaultUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    return '.userData'
  }
}

function createDefaultStore(): StoreLike {
  // electron-store v11 is ESM-only; require() returns { default: Store }
  const mod = require('electron-store') as {
    default?: new (opts: unknown) => StoreLike
  } & StoreLike
  const StoreClass = mod.default ?? (mod as unknown as new (opts: unknown) => StoreLike)
  return new StoreClass({
    cwd: getDefaultUserDataPath(),
    name: 'plugin-state',
    defaults: {
      pluginState: {}
    }
  })
}

export interface PluginStateStoreDeps {
  store?: StoreLike
}

export class PluginStateStore {
  private readonly store: StoreLike

  constructor(deps: PluginStateStoreDeps = {}) {
    this.store = deps.store ?? createDefaultStore()
  }

  list(): Record<string, PluginStateRecord> {
    return { ...(this.store.get('pluginState', {}) ?? {}) }
  }

  get(platformId: string): PluginStateRecord | undefined {
    return this.list()[platformId]
  }

  upsert(record: PluginStateRecord): PluginStateRecord {
    const records = this.list()
    records[record.platformId] = {
      ...record,
      settings: { ...record.settings },
      storage: { ...record.storage }
    }
    this.store.set('pluginState', records)
    return records[record.platformId]
  }

  ensureState(manifest: ExternalPluginManifest, installPath: string): PluginStateRecord {
    const existing = this.get(manifest.platformId)
    const now = Date.now()

    return this.upsert({
      pluginId: manifest.id,
      platformId: manifest.platformId,
      version: manifest.version,
      installPath,
      enabled: existing?.enabled ?? false,
      settings: { ...(existing?.settings ?? this.getDefaultSettings(manifest)) },
      storage: { ...(existing?.storage ?? {}) },
      lastError: existing?.lastError,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      circuitTrippedAt: existing?.circuitTrippedAt,
      checksum: existing?.checksum,
      diagnostics: existing?.diagnostics ?? [],
      installedAt: existing?.installedAt ?? now,
      updatedAt: now
    })
  }

  setEnabled(platformId: string, enabled: boolean): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      enabled,
      updatedAt: Date.now(),
      ...(enabled ? {} : { lastError: existing.lastError })
    })
  }

  updateSettings(platformId: string, nextSettings: Record<string, unknown>): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      settings: {
        ...existing.settings,
        ...nextSettings
      },
      updatedAt: Date.now()
    })
  }

  replaceSettings(platformId: string, settings: Record<string, unknown>): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      settings: { ...settings },
      updatedAt: Date.now()
    })
  }

  setLastError(platformId: string, lastError?: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      lastError,
      updatedAt: Date.now()
    })
  }

  recordCallSuccess(platformId: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      consecutiveFailures: 0,
      lastError: undefined,
      updatedAt: Date.now()
    })
  }

  recordCallFailure(
    platformId: string,
    method: string,
    error: string,
    maxDiagnostics = 20
  ): PluginStateRecord {
    const existing = this.requireState(platformId)
    const consecutiveFailures = (existing.consecutiveFailures ?? 0) + 1
    const diagnostics = [
      { timestamp: Date.now(), method, error },
      ...(existing.diagnostics ?? [])
    ].slice(0, maxDiagnostics)

    return this.upsert({
      ...existing,
      consecutiveFailures,
      lastError: error,
      diagnostics,
      updatedAt: Date.now()
    })
  }

  tripCircuit(platformId: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      enabled: false,
      circuitTrippedAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  resetCircuit(platformId: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      consecutiveFailures: 0,
      circuitTrippedAt: undefined,
      lastError: undefined,
      updatedAt: Date.now()
    })
  }

  setChecksum(platformId: string, checksum: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      checksum,
      updatedAt: Date.now()
    })
  }

  delete(platformId: string): void {
    const records = this.list()
    delete records[platformId]
    this.store.set('pluginState', records)
  }

  getStorageValue<T = unknown>(platformId: string, key: string): T | undefined {
    return this.requireState(platformId).storage[key] as T | undefined
  }

  setStorageValue(platformId: string, key: string, value: unknown): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      storage: {
        ...existing.storage,
        [key]: value
      },
      updatedAt: Date.now()
    })
  }

  removeStorageValue(platformId: string, key: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    const nextStorage = { ...existing.storage }
    delete nextStorage[key]

    return this.upsert({
      ...existing,
      storage: nextStorage,
      updatedAt: Date.now()
    })
  }

  clearStorage(platformId: string): PluginStateRecord {
    const existing = this.requireState(platformId)
    return this.upsert({
      ...existing,
      storage: {},
      updatedAt: Date.now()
    })
  }

  private requireState(platformId: string): PluginStateRecord {
    const state = this.get(platformId)
    if (!state) {
      throw new Error(`Plugin state not found for platform "${platformId}"`)
    }

    return state
  }

  private getDefaultSettings(manifest: ExternalPluginManifest): Record<string, unknown> {
    const definitions = manifest.contributions?.settings ?? []

    return Object.fromEntries(
      definitions
        .filter(definition => definition.default !== undefined)
        .map(definition => [definition.key, definition.default])
    )
  }
}
