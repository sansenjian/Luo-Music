import { computed, readonly, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'
import type { RenderStyle } from '@/composables/useRenderStyle'
import {
  BUILTIN_BRAND_THEME_PLUGIN_ID,
  PROJECT_RENDER_STYLE_OPTIONS,
  PROJECT_THEME_RESOURCE_PACKS,
  THEME_RESOURCE_PACKS_STORAGE_KEY,
  type ThemeResourcePackId
} from '@/ui/projectUi'

export type ThemeResourcePacksState = {
  enabledThemeResourcePackIds: ThemeResourcePackId[]
}

const DEFAULT_THEME_RESOURCE_PACKS: ThemeResourcePacksState = {
  enabledThemeResourcePackIds: []
}

const themeResourcePacksState = ref<ThemeResourcePacksState>({
  ...DEFAULT_THEME_RESOURCE_PACKS
})
let isThemeResourcePacksInitialized = false

type ThemeResourcePackStorage = Pick<StorageService, 'getJSON' | 'setJSON' | 'getItem'>

export type ThemeResourcePacksDeps = {
  storageService?: ThemeResourcePackStorage
}

const VALID_THEME_RESOURCE_PACK_IDS = new Set(PROJECT_THEME_RESOURCE_PACKS.map(pack => pack.id))

function isThemeResourcePackId(value: unknown): value is ThemeResourcePackId {
  return (
    typeof value === 'string' && VALID_THEME_RESOURCE_PACK_IDS.has(value as ThemeResourcePackId)
  )
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

export function useThemeResourcePacks(deps: ThemeResourcePacksDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

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
    return themeResourcePacksState.value.enabledThemeResourcePackIds.includes(themeResourcePackId)
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
    const option = PROJECT_RENDER_STYLE_OPTIONS.find(renderStyle => renderStyle.value === style)

    return Boolean(
      option &&
      (!option.themeResourcePackId || isThemeResourcePackEnabled(option.themeResourcePackId))
    )
  }

  return {
    themeResourcePacks: readonly(themeResourcePacksState),
    enabledThemeResourcePackIds: computed(() => [
      ...themeResourcePacksState.value.enabledThemeResourcePackIds
    ]),
    isThemeResourcePackEnabled,
    setThemeResourcePackEnabled,
    isRenderStyleAvailable
  }
}
