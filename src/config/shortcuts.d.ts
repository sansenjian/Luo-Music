// 快捷键配置类型声明

export interface ShortcutConfig {
  id: string
  name: string
  keys: string[]
  globalKeys?: string[]
  modifiers?: string[]
  action:
    | 'togglePlay'
    | 'playPrev'
    | 'playNext'
    | 'volumeUp'
    | 'volumeDown'
    | 'seekBack'
    | 'seekForward'
    | 'toggleCompact'
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[]
