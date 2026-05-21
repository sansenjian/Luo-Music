import { z } from 'zod'
import type {
  MusicPluginCapabilities,
  PluginCategory,
  PluginContribution,
  PluginMethodName,
  PluginPermissionDeclaration,
  PluginSettingDefinition,
  PluginThemeResource
} from '../../packages/plugin-sdk'
import type { PlatformDescriptor } from '@shared/types/platform'

export interface ExternalPluginEntry {
  main: string
  module: 'esm' | 'cjs'
}

export interface ExternalPluginManifest {
  manifestVersion: number
  id: string
  name: string
  version: string
  description?: string
  author?: string
  category?: PluginCategory
  platformId: string
  source: 'external'
  runtime: 'external-host'
  entry: ExternalPluginEntry
  capabilities: MusicPluginCapabilities
  requiresServices?: string[]
  permissions?: PluginPermissionDeclaration
  contributions?: {
    settings?: PluginSettingDefinition[]
    themeResources?: PluginThemeResource[]
  }
  contributionsV2?: PluginContribution[]
}

export interface PluginDiagnosticEntry {
  timestamp: number
  method: string
  error: string
}

export interface PluginStateRecord {
  pluginId: string
  platformId: string
  version: string
  installPath: string
  enabled: boolean
  settings: Record<string, unknown>
  storage: Record<string, unknown>
  secrets?: Record<string, unknown>
  lastError?: string
  consecutiveFailures: number
  circuitTrippedAt?: number
  checksum?: string
  diagnostics: PluginDiagnosticEntry[]
  installedAt: number
  updatedAt: number
}

export interface InstalledPluginLocation {
  manifest: ExternalPluginManifest
  installPath: string
  entryPath: string
  checksum: string
}

export interface ExternalPluginRegistration extends InstalledPluginLocation {
  state: PluginStateRecord
}

export type { PluginMethodName }

export interface PluginListResponse {
  platforms: PlatformDescriptor[]
}

export interface PluginSettingsResponse {
  settings: Record<string, unknown>
}

export interface PluginMutationResponse extends PluginListResponse {
  platform?: PlatformDescriptor
}

const pluginSettingOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1)
})

const pluginSettingDefinitionSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['boolean', 'text', 'select']),
  label: z.string().min(1),
  default: z.unknown().optional(),
  options: z.array(pluginSettingOptionSchema).optional()
})

const pluginThemeResourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  renderStyle: z.string().min(1),
  description: z.string().optional(),
  cssVariables: z.record(z.string().min(1), z.string()).optional(),
  cssFile: z.string().min(1).optional(),
  cssText: z.string().max(100_000).optional()
})

const pluginPlayerHookContributionSchema = z.object({
  type: z.literal('playerHook'),
  hook: z.enum([
    'beforePlay',
    'afterPlay',
    'beforeSongUrlRefresh',
    'afterSongUrlRefresh',
    'playbackError'
  ]),
  description: z.string().optional()
})

const pluginCapabilitiesSchema = z.object({
  search: z.boolean(),
  songUrl: z.boolean(),
  songDetail: z.boolean(),
  lyric: z.boolean(),
  playlistDetail: z.boolean(),
  needsHydration: z.boolean(),
  supportsLyricFetch: z.boolean(),
  supportsUrlRefreshOnFailure: z.boolean(),
  auth: z
    .object({
      login: z.boolean().optional(),
      logout: z.boolean().optional(),
      refresh: z.boolean().optional(),
      profile: z.boolean().optional(),
      importSession: z.boolean().optional(),
      preferredMode: z.enum(['qr', 'browser', 'form']).optional(),
      modes: z.array(z.enum(['qr', 'browser', 'form'])).optional()
    })
    .optional(),
  account: z
    .object({
      profile: z.boolean().optional()
    })
    .optional(),
  library: z
    .object({
      likedSongs: z.boolean().optional(),
      playlists: z.boolean().optional(),
      playlistTracks: z.boolean().optional()
    })
    .optional()
})

const pluginPermissionsSchema = z
  .object({
    network: z
      .object({
        domains: z.array(z.string().min(1)).default([])
      })
      .optional(),
    storage: z.boolean().optional(),
    secrets: z.boolean().optional()
  })
  .optional()

const pluginCategorySchema = z.enum(['api', 'extension', 'theme'])

export const ExternalPluginManifestSchema = z.object({
  manifestVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  category: pluginCategorySchema.optional(),
  platformId: z.string().min(1),
  source: z.literal('external'),
  runtime: z.literal('external-host'),
  entry: z.object({
    main: z.string().min(1),
    module: z.enum(['esm', 'cjs']).default('esm')
  }),
  capabilities: pluginCapabilitiesSchema,
  requiresServices: z.array(z.string().min(1)).optional(),
  permissions: pluginPermissionsSchema,
  contributions: z
    .object({
      settings: z.array(pluginSettingDefinitionSchema).optional(),
      themeResources: z.array(pluginThemeResourceSchema).optional()
    })
    .optional(),
  contributionsV2: z.array(pluginPlayerHookContributionSchema).optional()
})

export function createPlatformDescriptorFromExternalPlugin(
  registration: ExternalPluginRegistration
): PlatformDescriptor {
  const { manifest, state } = registration

  return {
    id: manifest.platformId,
    displayName: manifest.name,
    source: manifest.source,
    runtime: manifest.runtime,
    category: manifest.category ?? 'api',
    enabled: state.enabled,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    status: state.enabled
      ? state.circuitTrippedAt
        ? 'circuit-tripped'
        : state.lastError
          ? 'error'
          : 'ready'
      : 'disabled',
    lastError: state.lastError,
    capabilities: { ...manifest.capabilities },
    permissions: {
      networkDomains: [...(manifest.permissions?.network?.domains ?? [])],
      storage: Boolean(manifest.permissions?.storage),
      secrets: Boolean(manifest.permissions?.secrets)
    },
    settingsSchema: manifest.contributions?.settings,
    themeResources: manifest.contributions?.themeResources,
    consecutiveFailures: state.consecutiveFailures,
    circuitTrippedAt: state.circuitTrippedAt,
    ...(manifest.requiresServices ? { requiresServices: [...manifest.requiresServices] } : {})
  }
}
