import type { RenderStyle } from '@/composables/useRenderStyle'

export const DEFAULT_RENDER_STYLE: RenderStyle = 'classic'
export const THEME_RESOURCE_PACKS_STORAGE_KEY = 'themeResourcePacks'
export const BUILTIN_BRAND_THEME_PLUGIN_ID = 'builtin.brand-theme'

export type ThemeResourcePackId = typeof BUILTIN_BRAND_THEME_PLUGIN_ID

export interface ProjectRenderStyleOption {
  value: RenderStyle
  label: string
  themeResourcePackId?: ThemeResourcePackId
}

export interface ProjectThemeResourcePack {
  id: ThemeResourcePackId
  displayName: string
  description: string
  version: string
  renderStyle: RenderStyle
}

export const PROJECT_THEME_RESOURCE_PACKS: readonly ProjectThemeResourcePack[] = [
  {
    id: BUILTIN_BRAND_THEME_PLUGIN_ID,
    displayName: '品牌风格',
    description: '提供 LUO Music 品牌配色、柔和圆角、轻量玻璃面板和主题化播放器控件。',
    version: '1.0.0',
    renderStyle: 'brand'
  }
]

export const PROJECT_RENDER_STYLE_OPTIONS: readonly ProjectRenderStyleOption[] = [
  {
    value: 'classic',
    label: '经典风格'
  },
  {
    value: 'brand',
    label: '品牌风格',
    themeResourcePackId: BUILTIN_BRAND_THEME_PLUGIN_ID
  }
]

export function findProjectThemeResourcePack(
  themeResourcePackId: ThemeResourcePackId
): ProjectThemeResourcePack | undefined {
  return PROJECT_THEME_RESOURCE_PACKS.find(pack => pack.id === themeResourcePackId)
}
