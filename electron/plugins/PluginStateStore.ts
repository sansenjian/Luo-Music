import { app } from 'electron'
import { NETEASE_API_PORT, QQ_API_PORT } from '@shared/protocol/cache'
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

type SettingsMigrationResult = {
  settings: Record<string, unknown>
  migrated: boolean
}

const BUNDLED_PLUGIN_API_BASE_MIGRATIONS: Record<
  string,
  {
    legacyDefaults: string[]
    currentDefault: string
  }
> = {
  netease: {
    legacyDefaults: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    currentDefault: `http://127.0.0.1:${NETEASE_API_PORT}`
  },
  qq: {
    legacyDefaults: ['http://localhost:3300', 'http://127.0.0.1:3300'],
    currentDefault: `http://127.0.0.1:${QQ_API_PORT}`
  }
}

function normalizeApiBase(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  return value.replace(/\/+$/, '')
}

function isPluginStateRecordMap(value: unknown): value is Record<string, PluginStateRecord> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export class PluginStateStore {
  private readonly store: StoreLike

  constructor(deps: PluginStateStoreDeps = {}) {
    this.store = deps.store ?? createDefaultStore()
  }

  list(): Record<string, PluginStateRecord> {
    const records = this.store.get('pluginState', {})
    return isPluginStateRecordMap(records) ? { ...records } : {}
  }

  get(platformId: string): PluginStateRecord | undefined {
    return this.resolveState(platformId)
  }

  upsert(record: PluginStateRecord): PluginStateRecord {
    const records = this.list()
    if (
      record.platformId !== record.pluginId &&
      records[record.platformId]?.pluginId === record.pluginId
    ) {
      delete records[record.platformId]
    }
    records[record.pluginId] = {
      ...record,
      settings: { ...record.settings },
      storage: { ...record.storage },
      secrets: { ...record.secrets }
    }
    this.store.set('pluginState', records)
    return records[record.pluginId]
  }

  ensureState(manifest: ExternalPluginManifest, installPath: string): PluginStateRecord {
    const existing = this.resolveExistingStateForManifest(manifest)
    const now = Date.now()
    const settingsMigration = this.resolveSettings(manifest, existing?.settings)

    return this.upsert({
      pluginId: manifest.id,
      platformId: manifest.platformId,
      version: manifest.version,
      installPath,
      enabled: existing?.enabled ?? false,
      settings: settingsMigration.settings,
      storage: { ...existing?.storage },
      secrets: { ...existing?.secrets },
      lastError: settingsMigration.migrated ? undefined : existing?.lastError,
      consecutiveFailures: settingsMigration.migrated ? 0 : (existing?.consecutiveFailures ?? 0),
      circuitTrippedAt: settingsMigration.migrated ? undefined : existing?.circuitTrippedAt,
      checksum: existing?.checksum,
      diagnostics: settingsMigration.migrated ? [] : (existing?.diagnostics ?? []),
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
    const existing = this.resolveState(platformId)
    if (existing) {
      delete records[existing.pluginId]
    } else {
      delete records[platformId]
    }
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

  getSecretValue<T = unknown>(pluginId: string, key: string): T | undefined {
    return (this.requireState(pluginId).secrets ?? {})[key] as T | undefined
  }

  setSecretValue(pluginId: string, key: string, value: unknown): PluginStateRecord {
    const existing = this.requireState(pluginId)
    return this.upsert({
      ...existing,
      secrets: {
        ...existing.secrets,
        [key]: value
      },
      updatedAt: Date.now()
    })
  }

  removeSecretValue(pluginId: string, key: string): PluginStateRecord {
    const existing = this.requireState(pluginId)
    const nextSecrets = { ...existing.secrets }
    delete nextSecrets[key]

    return this.upsert({
      ...existing,
      secrets: nextSecrets,
      updatedAt: Date.now()
    })
  }

  clearSecrets(pluginId: string): PluginStateRecord {
    const existing = this.requireState(pluginId)
    return this.upsert({
      ...existing,
      secrets: {},
      updatedAt: Date.now()
    })
  }

  private requireState(platformIdOrPluginId: string): PluginStateRecord {
    const state = this.resolveState(platformIdOrPluginId)
    if (!state) {
      throw new Error(`Plugin state not found for "${platformIdOrPluginId}"`)
    }

    return state
  }

  private resolveState(platformIdOrPluginId: string): PluginStateRecord | undefined {
    const records = this.list()
    const direct = records[platformIdOrPluginId]
    if (direct) {
      return {
        ...direct,
        settings: { ...direct.settings },
        storage: { ...direct.storage },
        secrets: { ...direct.secrets }
      }
    }

    const byPlatform = Object.values(records).find(
      record => record.platformId === platformIdOrPluginId
    )

    return byPlatform
      ? {
          ...byPlatform,
          settings: { ...byPlatform.settings },
          storage: { ...byPlatform.storage },
          secrets: { ...byPlatform.secrets }
        }
      : undefined
  }

  private resolveExistingStateForManifest(
    manifest: ExternalPluginManifest
  ): PluginStateRecord | undefined {
    const records = this.list()
    const direct = records[manifest.id]
    if (direct) {
      return {
        ...direct,
        settings: { ...direct.settings },
        storage: { ...direct.storage },
        secrets: { ...direct.secrets }
      }
    }

    const legacy = records[manifest.platformId]
    if (
      legacy &&
      (legacy.pluginId === manifest.id ||
        legacy.pluginId === undefined ||
        legacy.pluginId === manifest.platformId)
    ) {
      return {
        ...legacy,
        pluginId: manifest.id,
        settings: { ...legacy.settings },
        storage: { ...legacy.storage },
        secrets: { ...legacy.secrets }
      }
    }

    return undefined
  }

  private getDefaultSettings(manifest: ExternalPluginManifest): Record<string, unknown> {
    const definitions = manifest.contributions?.settings ?? []

    return Object.fromEntries(
      definitions
        .filter(definition => definition.default !== undefined)
        .map(definition => [definition.key, definition.default])
    )
  }

  private resolveSettings(
    manifest: ExternalPluginManifest,
    existingSettings?: Record<string, unknown>
  ): SettingsMigrationResult {
    const defaults = this.getDefaultSettings(manifest)
    const settings = {
      ...defaults,
      ...existingSettings
    }
    const migration = BUNDLED_PLUGIN_API_BASE_MIGRATIONS[manifest.platformId]

    if (!migration) {
      return {
        settings,
        migrated: false
      }
    }

    const apiBase = normalizeApiBase(settings.apiBase)
    if (apiBase && migration.legacyDefaults.includes(apiBase)) {
      return {
        settings: {
          ...settings,
          apiBase: migration.currentDefault
        },
        migrated: true
      }
    }

    return {
      settings,
      migrated: false
    }
  }
}
