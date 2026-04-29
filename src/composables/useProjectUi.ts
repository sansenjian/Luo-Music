import { useRenderStyle, type RenderStyle } from '@/composables/useRenderStyle'
import { useThemeResourcePacks } from '@/composables/useThemeResourcePacks'
import { DEFAULT_RENDER_STYLE } from '@/ui/projectUi'

export function useProjectUi() {
  const { renderStyle, setRenderStyle } = useRenderStyle()
  const themeResourcePacks = useThemeResourcePacks()
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
