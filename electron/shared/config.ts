export interface AppConfig {
  playMode: 'list' | 'loop' | 'random'
  defaultVolume: number
  autoPlay: boolean
  lyricFontSize: number
  lyricFontFamily: string
  showTranslation: boolean
  enableDesktopLyric: boolean
  alwaysOnTop: boolean
  cacheSize: number
  enableCache: boolean
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
}

export type ConfigKey = keyof AppConfig

export interface ConfigChangeEvent {
  key: ConfigKey
  oldValue: unknown
  newValue: unknown
}
