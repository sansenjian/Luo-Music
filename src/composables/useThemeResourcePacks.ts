import { computed, readonly, ref } from 'vue'

import type { PluginThemeResource } from '@plugin-sdk'
import type { PlatformDescriptor } from '@shared/types/platform'
import { services } from '@/services'
import type { MusicService } from '@/services/musicService'
import type { StorageService } from '@/services/storageService'
import type { RenderStyle } from '@/composables/useRenderStyle'
import {
  BUILTIN_BRAND_THEME_PLUGIN_ID,
  DEFAULT_RENDER_STYLE,
  PROJECT_DEFAULT_RENDER_STYLE_OPTION,
  PROJECT_THEME_RESOURCE_PACKS,
  THEME_RESOURCE_PACKS_STORAGE_KEY,
  type ProjectRenderStyleOption,
  type ThemeResourcePackId
} from '@/ui/projectUi'

export type ThemeResourcePacksState = {
  enabledThemeResourcePackIds: ThemeResourcePackId[]
}

export interface ThemeResourcePackDescriptor extends PluginThemeResource {
  pluginId: string
  source: PlatformDescriptor['source']
  enabled: boolean
  status?: PlatformDescriptor['status']
}

const DEFAULT_THEME_RESOURCE_PACKS: ThemeResourcePacksState = {
  enabledThemeResourcePackIds: []
}
const THEME_RESOURCE_STYLE_ELEMENT_ID = 'luo-theme-resource-css'
const UNSAFE_CSS_IMPORT_PATTERN = /@import\b/i
const UNSAFE_CSS_URL_PATTERN = /url\(\s*(['"]?)\s*(?:javascript:|https?:)/i

const themeResourcePacksState = ref<ThemeResourcePacksState>({
  ...DEFAULT_THEME_RESOURCE_PACKS
})
const activeThemeVariableKeys = new Set<string>()
let isThemeResourcePacksInitialized = false

export type ThemeResourcePackStorage = Pick<StorageService, 'getJSON' | 'setJSON' | 'getItem'>
type ThemeResourcePackMusicService = Pick<MusicService, 'getPlatformDescriptors'>

export type ThemeResourcePacksDeps = {
  storageService?: ThemeResourcePackStorage
  musicService?: ThemeResourcePackMusicService
}

function isThemeResourcePackId(value: unknown): value is ThemeResourcePackId {
  return typeof value === 'string' && value.trim().length > 0
}

function createThemeResourcePacksState(
  enabledThemeResourcePackIds: ThemeResourcePackId[]
): ThemeResourcePacksState {
  return {
    enabledThemeResourcePackIds: Array.from(new Set(enabledThemeResourcePackIds))
  }
}

function sanitizeThemeResourcePacks(value: unknown): ThemeResourcePacksState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as {
    brandThemeEnabled?: unknown
    enabledThemeResourcePackIds?: unknown
  }

  if (Array.isArray(record.enabledThemeResourcePackIds)) {
    return createThemeResourcePacksState(
      record.enabledThemeResourcePackIds.filter(isThemeResourcePackId)
    )
  }

  if (typeof record.brandThemeEnabled === 'boolean') {
    return createThemeResourcePacksState(
      record.brandThemeEnabled ? [BUILTIN_BRAND_THEME_PLUGIN_ID] : []
    )
  }

  return { ...DEFAULT_THEME_RESOURCE_PACKS }
}

function getDefaultThemeResourcePacks(
  storageService: ThemeResourcePackStorage
): ThemeResourcePacksState {
  const legacyRenderStyle = storageService.getItem('renderStyle')

  return createThemeResourcePacksState(
    legacyRenderStyle === 'brand' || legacyRenderStyle === 'red'
      ? [BUILTIN_BRAND_THEME_PLUGIN_ID]
      : []
  )
}

function getFirstPartyThemeResourcePacks(): ThemeResourcePackDescriptor[] {
  return PROJECT_THEME_RESOURCE_PACKS.map(themeResourcePack => ({
    ...themeResourcePack,
    pluginId: themeResourcePack.id,
    source: 'builtin',
    enabled: themeResourcePacksState.value.enabledThemeResourcePackIds.includes(
      themeResourcePack.id
    ),
    status: themeResourcePacksState.value.enabledThemeResourcePackIds.includes(themeResourcePack.id)
      ? 'ready'
      : 'disabled'
  }))
}

function getDescriptorThemeResourcePacks(
  musicService: ThemeResourcePackMusicService
): ThemeResourcePackDescriptor[] {
  return musicService.getPlatformDescriptors().flatMap(platform =>
    (platform.themeResources ?? []).map(themeResourcePack => ({
      ...themeResourcePack,
      pluginId: platform.id,
      source: platform.source,
      enabled: platform.enabled,
      status: platform.status
    }))
  )
}

function getThemeResourcePacks(
  musicService: ThemeResourcePackMusicService
): ThemeResourcePackDescriptor[] {
  const resourcesById = new Map<string, ThemeResourcePackDescriptor>()

  for (const resource of getFirstPartyThemeResourcePacks()) {
    resourcesById.set(resource.id, resource)
  }

  for (const resource of getDescriptorThemeResourcePacks(musicService)) {
    resourcesById.set(resource.id, resource)
  }

  return Array.from(resourcesById.values())
}

function getEnabledThemeResourcePackByRenderStyle(
  style: RenderStyle,
  musicService: ThemeResourcePackMusicService
): ThemeResourcePackDescriptor | undefined {
  const resources = getThemeResourcePacks(musicService).filter(
    resource => resource.enabled && resource.renderStyle === style
  )

  return resources.find(resource => resource.source === 'external') ?? resources[0]
}

function getRenderStyleOptions(
  musicService: ThemeResourcePackMusicService
): ProjectRenderStyleOption[] {
  const optionsByStyle = new Map<RenderStyle, ProjectRenderStyleOption>([
    [PROJECT_DEFAULT_RENDER_STYLE_OPTION.value, PROJECT_DEFAULT_RENDER_STYLE_OPTION]
  ])

  for (const resource of getThemeResourcePacks(musicService)) {
    if (!resource.enabled) {
      continue
    }

    optionsByStyle.set(resource.renderStyle, {
      value: resource.renderStyle,
      label: resource.label,
      themeResourcePackId: resource.id
    })
  }

  return Array.from(optionsByStyle.values())
}

function isCssVariableName(value: string): boolean {
  return /^--[a-z0-9-_]+$/i.test(value)
}

function applyThemeResourceAttributes(themeResourcePack?: ThemeResourcePackDescriptor): void {
  if (typeof document === 'undefined') {
    return
  }

  const rootDataset = document.documentElement.dataset

  if (themeResourcePack) {
    rootDataset.themeResourcePack = themeResourcePack.id
    rootDataset.themePlugin = themeResourcePack.pluginId
    return
  }

  delete rootDataset.themeResourcePack
  delete rootDataset.themePlugin
}

function applyThemeResourceVariables(themeResourcePack?: PluginThemeResource): void {
  if (typeof document === 'undefined') {
    return
  }

  const rootStyle = document.documentElement.style

  for (const key of activeThemeVariableKeys) {
    rootStyle.removeProperty(key)
  }
  activeThemeVariableKeys.clear()

  for (const [key, value] of Object.entries(themeResourcePack?.cssVariables ?? {})) {
    if (!isCssVariableName(key)) {
      continue
    }

    rootStyle.setProperty(key, value)
    activeThemeVariableKeys.add(key)
  }
}

function isThemeCssTextAllowed(cssText: string): boolean {
  return !UNSAFE_CSS_IMPORT_PATTERN.test(cssText) && !UNSAFE_CSS_URL_PATTERN.test(cssText)
}

function applyThemeResourceCss(themeResourcePack?: PluginThemeResource): void {
  if (typeof document === 'undefined') {
    return
  }

  const existingStyle = document.getElementById(THEME_RESOURCE_STYLE_ELEMENT_ID)
  const cssText = themeResourcePack?.cssText?.trim()
  const themeResourceId = themeResourcePack?.id

  if (!cssText || !themeResourceId || !isThemeCssTextAllowed(cssText)) {
    existingStyle?.remove()
    return
  }

  const styleElement =
    existingStyle instanceof HTMLStyleElement ? existingStyle : document.createElement('style')

  styleElement.id = THEME_RESOURCE_STYLE_ELEMENT_ID
  styleElement.dataset.themeResourceId = themeResourceId
  styleElement.textContent = cssText

  if (!styleElement.parentElement) {
    document.head.append(styleElement)
  }
}

function applyThemeResource(themeResourcePack?: ThemeResourcePackDescriptor): void {
  applyThemeResourceAttributes(themeResourcePack)
  applyThemeResourceVariables(themeResourcePack)
  applyThemeResourceCss(themeResourcePack)
}

export function useThemeResourcePacks(deps: ThemeResourcePacksDeps = {}) {
  const storageService = deps.storageService ?? services.storage()
  const musicService = deps.musicService ?? services.music()

  if (!isThemeResourcePacksInitialized) {
    themeResourcePacksState.value =
      sanitizeThemeResourcePacks(
        storageService.getJSON<unknown>(THEME_RESOURCE_PACKS_STORAGE_KEY)
      ) ?? getDefaultThemeResourcePacks(storageService)
    isThemeResourcePacksInitialized = true
  }

  function persist(nextState: ThemeResourcePacksState): void {
    themeResourcePacksState.value = createThemeResourcePacksState(
      nextState.enabledThemeResourcePackIds
    )
    storageService.setJSON(THEME_RESOURCE_PACKS_STORAGE_KEY, themeResourcePacksState.value)
  }

  function isThemeResourcePackEnabled(themeResourcePackId: ThemeResourcePackId): boolean {
    return Boolean(
      getThemeResourcePacks(musicService).find(resource => resource.id === themeResourcePackId)
        ?.enabled
    )
  }

  function setThemeResourcePackEnabled(
    themeResourcePackId: ThemeResourcePackId,
    enabled: boolean
  ): void {
    const enabledIds = new Set(themeResourcePacksState.value.enabledThemeResourcePackIds)

    if (enabled) {
      enabledIds.add(themeResourcePackId)
    } else {
      enabledIds.delete(themeResourcePackId)
    }

    persist(createThemeResourcePacksState(Array.from(enabledIds)))
  }

  function isRenderStyleAvailable(style: RenderStyle): boolean {
    return (
      style === DEFAULT_RENDER_STYLE ||
      Boolean(getEnabledThemeResourcePackByRenderStyle(style, musicService))
    )
  }

  function applyThemeResourceForRenderStyle(style: RenderStyle): void {
    applyThemeResource(getEnabledThemeResourcePackByRenderStyle(style, musicService))
  }

  return {
    themeResourcePacks: readonly(themeResourcePacksState),
    availableThemeResourcePacks: computed(() => getThemeResourcePacks(musicService)),
    availableRenderStyleOptions: computed(() => getRenderStyleOptions(musicService)),
    enabledThemeResourcePackIds: computed(() => [
      ...themeResourcePacksState.value.enabledThemeResourcePackIds
    ]),
    isThemeResourcePackEnabled,
    setThemeResourcePackEnabled,
    isRenderStyleAvailable,
    applyThemeResourceForRenderStyle
  }
}
