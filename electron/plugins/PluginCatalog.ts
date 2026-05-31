import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PlatformDescriptor } from '@shared/types/platform'
import { PluginInstaller } from './PluginInstaller'
import { PluginStateStore } from './PluginStateStore'
import { ExternalPluginHost } from './ExternalPluginHost'
import {
  createPlatformDescriptorFromExternalPlugin,
  type ExternalPluginRegistration,
  type PluginMethodName,
  type PluginMutationResponse
} from './types'

function createCorePlatformDescriptor(): PlatformDescriptor {
  return {
    id: 'local',
    displayName: '本地音乐',
    source: 'core',
    runtime: 'local',
    enabled: true,
    status: 'ready',
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
  }
}

export interface PluginCatalogDeps {
  installer?: PluginInstaller
  stateStore?: PluginStateStore
  host?: ExternalPluginHost
  bundledPluginsDir?: string
}

export class PluginCatalog {
  private readonly installer: PluginInstaller
  private readonly stateStore: PluginStateStore
  private readonly host: ExternalPluginHost
  private readonly bundledPluginsDir: string
  private readonly listeners = new Set<(platforms: PlatformDescriptor[]) => void>()
  private externalPlugins = new Map<string, ExternalPluginRegistration>()
  private readonly circuitBreakerThreshold: number
  private scanCacheExpiry = 0
  private readonly scanCacheTtl: number

  constructor(
    deps: PluginCatalogDeps & { circuitBreakerThreshold?: number; scanCacheTtlMs?: number } = {}
  ) {
    this.stateStore = deps.stateStore ?? new PluginStateStore()
    this.installer = deps.installer ?? new PluginInstaller()
    this.host = deps.host ?? new ExternalPluginHost({ stateStore: this.stateStore })
    this.circuitBreakerThreshold = deps.circuitBreakerThreshold ?? 5
    this.bundledPluginsDir = deps.bundledPluginsDir ?? resolveBundledPluginsDir()
    this.scanCacheTtl = deps.scanCacheTtlMs ?? 5000
  }

  async initialize(): Promise<void> {
    await this.refreshExternalPlugins()
    await this.ensureBundledPlugins()
  }

  async dispose(): Promise<void> {
    await this.host.dispose()
  }

  onDidChange(listener: (platforms: PlatformDescriptor[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async listPlatforms(): Promise<PlatformDescriptor[]> {
    await this.refreshExternalPlugins()

    return [
      createCorePlatformDescriptor(),
      ...Array.from(this.externalPlugins.values())
        .map(registration => createPlatformDescriptorFromExternalPlugin(registration))
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
    ]
  }

  async installFromPath(
    pluginPath: string,
    options?: { enabledByDefault?: boolean }
  ): Promise<PluginMutationResponse> {
    const installedPlugins = await this.installer.installManyFromPath(pluginPath)
    this.scanCacheExpiry = 0
    let lastInstalledPlatformId: string | undefined

    for (const installedPlugin of installedPlugins) {
      let state = this.stateStore.ensureState(installedPlugin.manifest, installedPlugin.installPath)

      if (options?.enabledByDefault && !state.enabled) {
        state = this.stateStore.setEnabled(installedPlugin.manifest.id, true)
      }

      this.stateStore.setChecksum(installedPlugin.manifest.id, installedPlugin.checksum)

      this.externalPlugins.set(installedPlugin.manifest.platformId, {
        ...installedPlugin,
        state: this.stateStore.get(installedPlugin.manifest.id) ?? state
      })
      lastInstalledPlatformId = installedPlugin.manifest.platformId
    }

    return this.notifyMutation(installedPlugins.length === 1 ? lastInstalledPlatformId : undefined)
  }

  async setEnabled(platformId: string, enabled: boolean): Promise<PluginMutationResponse> {
    const registration = await this.requireExternalPlugin(platformId, true)

    if (enabled && registration.state.circuitTrippedAt) {
      this.stateStore.resetCircuit(platformId)
    }

    const state = this.stateStore.setEnabled(platformId, enabled)

    if (!enabled) {
      await this.host.stop(platformId)
    }

    this.externalPlugins.set(platformId, {
      ...registration,
      state
    })

    return this.notifyMutation(platformId)
  }

  async uninstall(platformId: string): Promise<PluginMutationResponse> {
    const registration = await this.requireExternalPlugin(platformId, true)

    await this.host.stop(platformId)
    await this.installer.uninstall(registration.manifest.id)
    this.stateStore.delete(registration.manifest.id)
    this.externalPlugins.delete(platformId)

    return this.notifyMutation()
  }

  async getSettings(platformId: string): Promise<Record<string, unknown>> {
    const registration = await this.requireExternalPlugin(platformId)
    return { ...registration.state.settings }
  }

  async updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    await this.requireExternalPlugin(platformId)
    const state = this.stateStore.updateSettings(platformId, settings)

    await this.host.stop(platformId)

    const registration = this.externalPlugins.get(platformId)
    if (registration) {
      this.externalPlugins.set(platformId, {
        ...registration,
        state
      })
    }

    await this.notifyChanged()
    return { ...state.settings }
  }

  async call(platformId: string, method: PluginMethodName, payload: unknown): Promise<unknown> {
    const registration = await this.requireExternalPlugin(platformId)

    if (!registration.state.enabled) {
      throw new Error(`Plugin platform is disabled: ${platformId}`)
    }

    if (registration.state.circuitTrippedAt) {
      throw new Error(
        `Plugin circuit breaker tripped for "${platformId}" at ${new Date(registration.state.circuitTrippedAt).toISOString()}. Disable and re-enable to reset.`
      )
    }

    try {
      const result = await this.host.call(registration, method, payload)
      const nextState = this.stateStore.recordCallSuccess(platformId)
      this.externalPlugins.set(platformId, {
        ...registration,
        state: nextState
      })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const failedState = this.stateStore.recordCallFailure(platformId, method, errorMessage)

      if (failedState.consecutiveFailures >= this.circuitBreakerThreshold) {
        const trippedState = this.stateStore.tripCircuit(platformId)
        await this.host.stop(platformId)
        this.externalPlugins.set(platformId, {
          ...registration,
          state: trippedState
        })
        await this.notifyChanged()
        const circuitError = new Error(
          `Plugin "${platformId}" circuit breaker tripped after ${this.circuitBreakerThreshold} consecutive failures. The plugin has been automatically disabled.`
        )
        ;(circuitError as Error & { cause?: unknown }).cause = error
        throw circuitError
      }

      this.externalPlugins.set(platformId, {
        ...registration,
        state: failedState
      })
      await this.notifyChanged()
      throw error
    }
  }

  private async refreshExternalPlugins(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now < this.scanCacheExpiry) return

    const installedPlugins = await this.installer.scanInstalledPlugins()
    const registrations = new Map<string, ExternalPluginRegistration>()

    for (const installedPlugin of installedPlugins) {
      const state = this.stateStore.ensureState(
        installedPlugin.manifest,
        installedPlugin.installPath
      )
      registrations.set(installedPlugin.manifest.platformId, {
        ...installedPlugin,
        state
      })
    }

    this.externalPlugins = registrations
    this.scanCacheExpiry = Date.now() + this.scanCacheTtl
  }

  private async requireExternalPlugin(
    platformId: string,
    force = false
  ): Promise<ExternalPluginRegistration> {
    await this.refreshExternalPlugins(force)
    const registration = this.externalPlugins.get(platformId)

    if (!registration) {
      throw new Error(`External plugin platform not found: ${platformId}`)
    }

    return registration
  }

  private async notifyMutation(platformId?: string): Promise<PluginMutationResponse> {
    const platforms = await this.listPlatforms()
    await this.notifyChanged(platforms)

    return {
      platforms,
      platform: platformId ? platforms.find(platform => platform.id === platformId) : undefined
    }
  }

  private async notifyChanged(platforms?: PlatformDescriptor[]): Promise<void> {
    const currentPlatforms = platforms ?? (await this.listPlatforms())

    for (const listener of this.listeners) {
      listener(currentPlatforms)
    }
  }

  private async ensureBundledPlugins(): Promise<void> {
    let dirEntries: string[]
    try {
      const { readdir } = await import('node:fs/promises')
      dirEntries = await readdir(this.bundledPluginsDir)
    } catch {
      return
    }

    for (const entry of dirEntries) {
      const pluginDir = path.join(this.bundledPluginsDir, entry)
      try {
        const { stat } = await import('node:fs/promises')
        const entryStat = await stat(pluginDir)
        if (!entryStat.isDirectory()) continue
      } catch {
        continue
      }

      try {
        const manifest = await this.readBundledManifest(pluginDir)
        const installedPlugin = this.externalPlugins.get(manifest.platformId)

        if (
          installedPlugin &&
          (installedPlugin.manifest.id !== manifest.id ||
            installedPlugin.manifest.version === manifest.version)
        ) {
          continue
        }

        await this.installFromPath(pluginDir, { enabledByDefault: true })
      } catch {
        // Skip invalid bundled plugins silently
      }
    }
  }

  private async readBundledManifest(
    pluginDir: string
  ): Promise<{ id: string; platformId: string; version: string }> {
    const { readFile } = await import('node:fs/promises')
    const manifestPath = path.join(pluginDir, 'manifest.json')
    const content = await readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>

    if (!parsed.platformId || typeof parsed.platformId !== 'string') {
      throw new Error(`Bundled plugin missing platformId: ${pluginDir}`)
    }

    if (!parsed.id || typeof parsed.id !== 'string') {
      throw new Error(`Bundled plugin missing id: ${pluginDir}`)
    }

    if (!parsed.version || typeof parsed.version !== 'string') {
      throw new Error(`Bundled plugin missing version: ${pluginDir}`)
    }

    return { id: parsed.id, platformId: parsed.platformId, version: parsed.version }
  }
}

function resolveBundledPluginsDir(): string {
  try {
    const thisFilePath = fileURLToPath(import.meta.url)
    return path.resolve(path.dirname(thisFilePath), '..', '..', 'plugins', 'third-party')
  } catch {
    return path.resolve(process.cwd(), 'plugins', 'third-party')
  }
}
