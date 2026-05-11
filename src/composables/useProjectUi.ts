import { useRenderStyle, type RenderStyle } from '@/composables/useRenderStyle'
import {
  useThemeResourcePacks,
  type ThemeResourcePackStorage,
  type ThemeResourcePacksDeps
} from '@/composables/useThemeResourcePacks'
import { DEFAULT_RENDER_STYLE } from '@/ui/projectUi'
import type { StorageService } from '@/services/storageService'

type ProjectUiStorage = ThemeResourcePackStorage & Pick<StorageService, 'setItem'>

export type ProjectUiDeps = Omit<ThemeResourcePacksDeps, 'storageService'> & {
  storageService?: ProjectUiStorage
}

export function useProjectUi(deps: ProjectUiDeps = {}) {
  const { renderStyle, setRenderStyle } = useRenderStyle({ storageService: deps.storageService })
  const themeResourcePacks = useThemeResourcePacks(deps)
  themeResourcePacks.applyThemeResourceForRenderStyle(renderStyle.value)

  function isRenderStyleAvailable(style: RenderStyle): boolean {
    return themeResourcePacks.isRenderStyleAvailable(style)
  }

  function setAvailableRenderStyle(style: RenderStyle): void {
    const nextStyle = isRenderStyleAvailable(style) ? style : DEFAULT_RENDER_STYLE
    setRenderStyle(nextStyle)
    themeResourcePacks.applyThemeResourceForRenderStyle(nextStyle)
  }

  function ensureAvailableRenderStyle(): void {
    if (!isRenderStyleAvailable(renderStyle.value)) {
      setRenderStyle(DEFAULT_RENDER_STYLE)
    }

    themeResourcePacks.applyThemeResourceForRenderStyle(renderStyle.value)
  }

  function isRenderStyleActive(style: RenderStyle): boolean {
    return renderStyle.value === style
  }

  return {
    ...themeResourcePacks,
    renderStyle,
    setRenderStyle: setAvailableRenderStyle,
    availableRenderStyleOptions: themeResourcePacks.availableRenderStyleOptions,
    isRenderStyleAvailable,
    ensureAvailableRenderStyle,
    isRenderStyleActive
  }
}
