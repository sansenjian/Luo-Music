import { readonly, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

export type RenderStyle = 'classic' | 'brand'
type LegacyRenderStyle = 'red'

const RENDER_STYLE_STORAGE_KEY = 'renderStyle'
const DEFAULT_RENDER_STYLE: RenderStyle = 'classic'
const VALID_RENDER_STYLES = new Set<RenderStyle>(['classic', 'brand'])
const LEGACY_RENDER_STYLE_MAP: Record<LegacyRenderStyle, RenderStyle> = {
  red: 'brand'
}

const renderStyleState = ref<RenderStyle>(DEFAULT_RENDER_STYLE)
let isRenderStyleInitialized = false

function resolveRenderStyle(value: string | null): RenderStyle {
  if (value && value in LEGACY_RENDER_STYLE_MAP) {
    return LEGACY_RENDER_STYLE_MAP[value as LegacyRenderStyle]
  }

  return value && VALID_RENDER_STYLES.has(value as RenderStyle)
    ? (value as RenderStyle)
    : DEFAULT_RENDER_STYLE
}

function applyRenderStyleToDocument(style: RenderStyle): void {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.renderStyle = style
}

export type RenderStyleDeps = {
  storageService?: Pick<StorageService, 'getItem' | 'setItem'>
}

export function useRenderStyle(deps: RenderStyleDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

  if (!isRenderStyleInitialized) {
    const storedRenderStyle = storageService.getItem(RENDER_STYLE_STORAGE_KEY)
    const resolvedRenderStyle = resolveRenderStyle(storedRenderStyle)

    renderStyleState.value = resolvedRenderStyle
    applyRenderStyleToDocument(renderStyleState.value)

    if (storedRenderStyle === 'red') {
      storageService.setItem(RENDER_STYLE_STORAGE_KEY, resolvedRenderStyle)
    }

    isRenderStyleInitialized = true
  } else {
    applyRenderStyleToDocument(renderStyleState.value)
  }

  function setRenderStyle(nextStyle: RenderStyle): void {
    renderStyleState.value = nextStyle
    applyRenderStyleToDocument(nextStyle)
    storageService.setItem(RENDER_STYLE_STORAGE_KEY, nextStyle)
  }

  return {
    renderStyle: readonly(renderStyleState),
    setRenderStyle
  }
}
