// 快捷键配置类型声明

export interface ShortcutConfig {
  id: string
  name: string
  keys: string[]
  globalKeys?: string[]
  modifiers?: string[]
  action: string
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[]
