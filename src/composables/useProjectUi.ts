import { computed } from 'vue'

import { useRenderStyle, type RenderStyle } from '@/composables/useRenderStyle'
import { useThemeResourcePacks } from '@/composables/useThemeResourcePacks'
import {
  DEFAULT_RENDER_STYLE,
  PROJECT_RENDER_STYLE_OPTIONS,
  type ProjectRenderStyleOption
} from '@/ui/projectUi'

export function useProjectUi() {
  const { renderStyle, setRenderStyle } = useRenderStyle()
  const themeResourcePacks = useThemeResourcePacks()

  const availableRenderStyleOptions = computed<ProjectRenderStyleOption[]>(() =>
    PROJECT_RENDER_STYLE_OPTIONS.filter(option =>
      themeResourcePacks.isRenderStyleAvailable(option.value)
    )
  )

  function isRenderStyleAvailable(style: RenderStyle): boolean {
    return availableRenderStyleOptions.value.some(option => option.value === style)
  }

  function setAvailableRenderStyle(style: RenderStyle): void {
    setRenderStyle(isRenderStyleAvailable(style) ? style : DEFAULT_RENDER_STYLE)
  }

  function ensureAvailableRenderStyle(): void {
    if (!isRenderStyleAvailable(renderStyle.value)) {
      setRenderStyle(DEFAULT_RENDER_STYLE)
    }
  }

  function isRenderStyleActive(style: RenderStyle): boolean {
    return renderStyle.value === style
  }

  return {
    ...themeResourcePacks,
    renderStyle,
    setRenderStyle: setAvailableRenderStyle,
    availableRenderStyleOptions,
    isRenderStyleAvailable,
    ensureAvailableRenderStyle,
    isRenderStyleActive
  }
}
