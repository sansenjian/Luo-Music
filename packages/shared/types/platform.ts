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
