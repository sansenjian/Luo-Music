import type { PluginThemeResource } from '@plugin-sdk'
import type { RenderStyle } from '@/composables/useRenderStyle'

export const DEFAULT_RENDER_STYLE: RenderStyle = 'classic'
export const DEFAULT_RENDER_STYLE_LABEL = '经典风格'
export const THEME_RESOURCE_PACKS_STORAGE_KEY = 'themeResourcePacks'
export const BUILTIN_BRAND_THEME_PLUGIN_ID = 'builtin.brand-theme'

export type ThemeResourcePackId = string

export interface ProjectRenderStyleOption {
  value: RenderStyle
  label: string
  themeResourcePackId?: ThemeResourcePackId
}

export type ProjectThemeResourcePack = PluginThemeResource

export const PROJECT_THEME_RESOURCE_PACKS: readonly ProjectThemeResourcePack[] = [
  {
    id: BUILTIN_BRAND_THEME_PLUGIN_ID,
    label: '品牌风格',
    description: '提供 LUO Music 品牌配色、柔和圆角、轻量玻璃面板和主题化播放器控件。',
    renderStyle: 'brand'
  }
]

export const PROJECT_DEFAULT_RENDER_STYLE_OPTION: ProjectRenderStyleOption = {
  value: DEFAULT_RENDER_STYLE,
  label: DEFAULT_RENDER_STYLE_LABEL
}

export const PROJECT_RENDER_STYLE_OPTIONS: readonly ProjectRenderStyleOption[] = [
  PROJECT_DEFAULT_RENDER_STYLE_OPTION,
  ...PROJECT_THEME_RESOURCE_PACKS.map(themeResourcePack => ({
    value: themeResourcePack.renderStyle,
    label: themeResourcePack.label,
    themeResourcePackId: themeResourcePack.id
  }))
]

export function findProjectThemeResourcePack(
  themeResourcePackId: ThemeResourcePackId
): ProjectThemeResourcePack | undefined {
  return PROJECT_THEME_RESOURCE_PACKS.find(pack => pack.id === themeResourcePackId)
}
