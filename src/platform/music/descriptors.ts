import { shallowRef } from 'vue'
import type { PluginManifest, PluginSettingDefinition, PluginThemeResource } from '@plugin-sdk'

export type PlatformCapabilities = PluginManifest['capabilities']
export type PlatformBooleanCapability = {
  [K in keyof PlatformCapabilities]-?: NonNullable<PlatformCapabilities[K]> extends boolean
    ? K
    : never
}[keyof PlatformCapabilities]

export interface PlatformPermissions {
  networkDomains?: string[]
  storage?: boolean
  secrets?: boolean
}

export interface PlatformDescriptor {
  id: string
  displayName: string
  source: PluginManifest['source']
  runtime: PluginManifest['runtime']
  category?: PluginManifest['category']
  enabled: boolean
  capabilities: PlatformCapabilities
  requiresServices?: string[]
  version?: string
  description?: string
  author?: string
  status?: 'ready' | 'disabled' | 'error' | 'circuit-tripped'
  lastError?: string
  permissions?: PlatformPermissions
  settingsSchema?: PluginSettingDefinition[]
  themeResources?: PluginThemeResource[]
  consecutiveFailures?: number
  circuitTrippedAt?: number
}

export interface PlatformOption {
  value: string
  label: string
}

const unsupportedPlatformCapabilities: PlatformCapabilities = {
  search: false,
  songUrl: false,
  songDetail: false,
  lyric: false,
  playlistDetail: false,
  needsHydration: false,
  supportsLyricFetch: false,
  supportsUrlRefreshOnFailure: false
}

const staticPlatformDescriptors: Record<string, PlatformDescriptor> = {
  local: {
    id: 'local',
    displayName: '本地音乐',
    source: 'core',
    runtime: 'local',
    category: 'api',
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

const runtimePlatformDescriptors = shallowRef<Record<string, PlatformDescriptor>>({})
const legacyLoginPlatformIds = new Set(['netease', 'qq'])

function cloneCapabilities(capabilities: PlatformCapabilities): PlatformCapabilities {
  return {
    ...capabilities,
    ...(capabilities.auth
      ? {
          auth: {
            ...capabilities.auth,
            ...(capabilities.auth.modes ? { modes: [...capabilities.auth.modes] } : {})
          }
        }
      : {})
  }
}

function cloneThemeResource(resource: PluginThemeResource): PluginThemeResource {
  return {
    ...resource,
    ...(resource.cssVariables ? { cssVariables: { ...resource.cssVariables } } : {}),
    ...(resource.cssFile ? { cssFile: resource.cssFile } : {}),
    ...(resource.cssText ? { cssText: resource.cssText } : {})
  }
}

function cloneDescriptor(descriptor: PlatformDescriptor): PlatformDescriptor {
  return {
    ...descriptor,
    capabilities: cloneCapabilities(descriptor.capabilities),
    ...(descriptor.requiresServices ? { requiresServices: [...descriptor.requiresServices] } : {}),
    ...(descriptor.permissions
      ? {
          permissions: {
            networkDomains: [...(descriptor.permissions.networkDomains ?? [])],
            storage: descriptor.permissions.storage,
            secrets: descriptor.permissions.secrets
          }
        }
      : {}),
    ...(descriptor.settingsSchema ? { settingsSchema: [...descriptor.settingsSchema] } : {}),
    ...(descriptor.themeResources
      ? { themeResources: descriptor.themeResources.map(cloneThemeResource) }
      : {})
  }
}

function getMergedPlatformDescriptors(): Record<string, PlatformDescriptor> {
  return {
    ...staticPlatformDescriptors,
    ...runtimePlatformDescriptors.value
  }
}

export function replaceRuntimePlatformDescriptors(descriptors: PlatformDescriptor[]): void {
  runtimePlatformDescriptors.value = Object.fromEntries(
    descriptors.map(descriptor => [descriptor.id, cloneDescriptor(descriptor)])
  )
}

export function resetRuntimePlatformDescriptors(): void {
  runtimePlatformDescriptors.value = {}
}

export function getPlatformDescriptors(): PlatformDescriptor[] {
  return Object.values(getMergedPlatformDescriptors()).map(cloneDescriptor)
}

export function getPlatformDescriptor(platformId: string): PlatformDescriptor | undefined {
  const descriptors = getMergedPlatformDescriptors()

  if (!Object.prototype.hasOwnProperty.call(descriptors, platformId)) {
    return undefined
  }

  return cloneDescriptor(descriptors[platformId])
}

export function getEnabledPlatformDescriptors(): PlatformDescriptor[] {
  return getPlatformDescriptors().filter(descriptor => descriptor.enabled)
}

export function getSearchablePlatformDescriptors(): PlatformDescriptor[] {
  return getEnabledPlatformDescriptors().filter(descriptor => descriptor.capabilities.search)
}

export function getLoginCapablePlatformDescriptors(): PlatformDescriptor[] {
  return getEnabledPlatformDescriptors().filter(descriptor => {
    if (descriptor.capabilities.auth?.login === true) {
      return true
    }

    // Compatibility bridge for already-installed first-party platform plugins whose
    // manifest has not been refreshed to the auth-capability schema yet.
    return legacyLoginPlatformIds.has(descriptor.id)
  })
}

export function getPlatformCapabilities(platformId: string): PlatformCapabilities {
  const descriptors = getMergedPlatformDescriptors()

  if (!Object.prototype.hasOwnProperty.call(descriptors, platformId)) {
    return cloneCapabilities(unsupportedPlatformCapabilities)
  }

  return cloneCapabilities(descriptors[platformId].capabilities)
}

export function hasPlatformCapability(
  platformId: string,
  capability: PlatformBooleanCapability
): boolean {
  return getPlatformCapabilities(platformId)[capability]
}

export function getDefaultSearchPlatformId(): string {
  const searchable = getSearchablePlatformDescriptors()
  const nonLocal = searchable.find(d => d.id !== 'local')
  return nonLocal?.id ?? searchable[0]?.id ?? 'netease'
}

export function getSearchPlatformOptions(): PlatformOption[] {
  const searchable = getSearchablePlatformDescriptors()
  const nonLocal = searchable.filter(d => d.id !== 'local')
  const local = searchable.filter(d => d.id === 'local')
  return [...nonLocal, ...local].map(descriptor => ({
    value: descriptor.id,
    label: descriptor.displayName
  }))
}

export function getLoginPlatformOptions(): PlatformOption[] {
  return getLoginCapablePlatformDescriptors().map(descriptor => ({
    value: descriptor.id,
    label: descriptor.displayName
  }))
}
