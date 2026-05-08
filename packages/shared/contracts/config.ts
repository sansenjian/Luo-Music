export type LyricFontWeight = 'standard' | 'bold' | 'heavy'
export type LyricStrokeStyle = 'outline' | 'none'
export type LyricLineMode = 'single-line' | 'double-line'
export type LyricFlowDirection = 'horizontal' | 'vertical'
export type LyricTextAlign = 'left' | 'center' | 'right'
export type LyricColorPreset =
  | 'classic-default'
  | 'vitality-purple'
  | 'midnight-neon'
  | 'mint-pop'
  | 'sunset-glow'

export interface AppConfig {
  playMode: 'list' | 'loop' | 'random'
  defaultVolume: number
  autoPlay: boolean
  lyricFontSize: number
  lyricFontFamily: string
  lyricFontWeight: LyricFontWeight
  lyricStrokeStyle: LyricStrokeStyle
  lyricLineMode: LyricLineMode
  lyricFlowDirection: LyricFlowDirection
  lyricTextAlign: LyricTextAlign
  lyricColorPreset: LyricColorPreset
  lyricPlayedColor: string
  lyricUnplayedColor: string
  showTranslation: boolean
  showRomanizedLyrics: boolean
  enableDesktopLyric: boolean
  alwaysOnTop: boolean
  cacheSize: number
  enableCache: boolean
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  playMode: 'list',
  defaultVolume: 0.7,
  autoPlay: false,
  lyricFontSize: 36,
  lyricFontFamily: '"Inter", "Noto Sans SC", sans-serif',
  lyricFontWeight: 'standard',
  lyricStrokeStyle: 'outline',
  lyricLineMode: 'single-line',
  lyricFlowDirection: 'horizontal',
  lyricTextAlign: 'center',
  lyricColorPreset: 'classic-default',
  lyricPlayedColor: '#ffffff',
  lyricUnplayedColor: '#0a0a0a',
  showTranslation: true,
  showRomanizedLyrics: false,
  enableDesktopLyric: false,
  alwaysOnTop: false,
  cacheSize: 512,
  enableCache: true,
  theme: 'system',
  language: 'zh-CN'
}

export type ConfigKey = keyof AppConfig

export interface ConfigChangeEvent {
  key: ConfigKey
  oldValue: unknown
  newValue: unknown
}
