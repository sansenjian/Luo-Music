import type {
  AppConfig,
  LyricColorPreset,
  LyricFlowDirection,
  LyricFontWeight,
  LyricLineMode,
  LyricStrokeStyle,
  LyricTextAlign
} from '@/platform/contracts/config'
import { DEFAULT_APP_CONFIG } from '@/platform/contracts/config'

export type DesktopLyricOption<T extends string = string> = {
  label: string
  value: T
}

export const DESKTOP_LYRIC_FONT_OPTIONS: DesktopLyricOption[] = [
  { label: '系统默认', value: DEFAULT_APP_CONFIG.lyricFontFamily },
  { label: '飞花宋体', value: '"STSong", "SimSun", serif' },
  { label: '思源黑体', value: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
  { label: '霞鹜文楷', value: '"LXGW WenKai", "KaiTi", serif' },
  { label: 'HarmonyOS Sans', value: '"HarmonyOS Sans SC", "Microsoft YaHei", sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' }
]

export const DESKTOP_LYRIC_FONT_SIZE_OPTIONS: number[] = [22, 26, 30, 34, 36, 38, 42]

export const DESKTOP_LYRIC_FONT_WEIGHT_OPTIONS: Array<DesktopLyricOption<LyricFontWeight>> = [
  { label: '标准', value: 'standard' },
  { label: '加粗', value: 'bold' },
  { label: '厚重', value: 'heavy' }
]

export const DESKTOP_LYRIC_STROKE_OPTIONS: Array<DesktopLyricOption<LyricStrokeStyle>> = [
  { label: '有描边', value: 'outline' },
  { label: '无描边', value: 'none' }
]

export const DESKTOP_LYRIC_LINE_MODE_OPTIONS: Array<DesktopLyricOption<LyricLineMode>> = [
  { label: '单行显示', value: 'single-line' },
  { label: '双行显示', value: 'double-line' }
]

export const DESKTOP_LYRIC_FLOW_OPTIONS: Array<DesktopLyricOption<LyricFlowDirection>> = [
  { label: '横排显示', value: 'horizontal' },
  { label: '竖排显示', value: 'vertical' }
]

export const DESKTOP_LYRIC_ALIGN_OPTIONS: Array<DesktopLyricOption<LyricTextAlign>> = [
  { label: '居左', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '居右', value: 'right' }
]

export const DESKTOP_LYRIC_COLOR_PRESETS: Record<
  LyricColorPreset,
  { label: string; playedColor: string; unplayedColor: string }
> = {
  'classic-default': {
    label: '经典默认',
    playedColor: '#ffffff',
    unplayedColor: '#0a0a0a'
  },
  'vitality-purple': {
    label: '活力紫',
    playedColor: '#7c3aed',
    unplayedColor: '#cbd5e1'
  },
  'midnight-neon': {
    label: '夜幕蓝',
    playedColor: '#2563eb',
    unplayedColor: '#94a3b8'
  },
  'mint-pop': {
    label: '薄荷青',
    playedColor: '#0f766e',
    unplayedColor: '#d6f5ec'
  },
  'sunset-glow': {
    label: '落日橙',
    playedColor: '#ea580c',
    unplayedColor: '#fde7d7'
  }
}

export const DESKTOP_LYRIC_COLOR_PRESET_OPTIONS: Array<DesktopLyricOption<LyricColorPreset>> =
  Object.entries(DESKTOP_LYRIC_COLOR_PRESETS).map(([value, preset]) => ({
    label: preset.label,
    value: value as LyricColorPreset
  }))

export const DESKTOP_LYRIC_PREVIEW = {
  romanized: 'ka su n da mi ra i ni ki ta i wo se o tte',
  original: '霞んだ未来に期待を背負って',
  translation: '背负着对朦胧未来的期待'
}

export function resolveDesktopLyricPresetColors(
  preset: LyricColorPreset
): Pick<AppConfig, 'lyricPlayedColor' | 'lyricUnplayedColor'> {
  const resolvedPreset =
    DESKTOP_LYRIC_COLOR_PRESETS[preset] ?? DESKTOP_LYRIC_COLOR_PRESETS['classic-default']

  return {
    lyricPlayedColor: resolvedPreset.playedColor,
    lyricUnplayedColor: resolvedPreset.unplayedColor
  }
}

export function resolveDesktopLyricFontWeight(weight: LyricFontWeight): {
  main: number
  sub: number
} {
  switch (weight) {
    case 'bold':
      return { main: 900, sub: 700 }
    case 'heavy':
      return { main: 950, sub: 800 }
    case 'standard':
    default:
      return { main: 800, sub: 600 }
  }
}

export function resolveDesktopLyricLineClamp(mode: LyricLineMode): number {
  return mode === 'double-line' ? 2 : 1
}

export function resolveDesktopLyricAlignItems(textAlign: LyricTextAlign): string {
  switch (textAlign) {
    case 'left':
      return 'flex-start'
    case 'right':
      return 'flex-end'
    case 'center':
    default:
      return 'center'
  }
}

export function resolveDesktopLyricWritingMode(flowDirection: LyricFlowDirection): {
  writingMode: string
  textOrientation: string
} {
  return flowDirection === 'vertical'
    ? {
        writingMode: 'vertical-rl',
        textOrientation: 'mixed'
      }
    : {
        writingMode: 'horizontal-tb',
        textOrientation: 'mixed'
      }
}
