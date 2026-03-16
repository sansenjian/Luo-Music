/**
 * 全局快捷键管理
 *
 * 负责注册和管理全局快捷键。
 * 遵循 VSCode 的 Keybinding 模式，将快捷键逻辑集中管理。
 */

import { globalShortcut } from 'electron'
import logger from '../logger'

/**
 * 快捷键动作映射类型
 */
export type ShortcutAction =
  | 'togglePlay'
  | 'playPrev'
  | 'playNext'
  | 'volumeUp'
  | 'volumeDown'
  | 'seekBack'
  | 'seekForward'
  | 'toggleCompact'

/**
 * 快捷键配置类型
 */
export interface ShortcutConfig {
  action: ShortcutAction
  globalKeys?: string[]
}

/**
 * 窗口管理器引用
 */
let windowManager: {
  send: (channel: string, ...args: unknown[]) => void
} | null = null

/**
 * 设置窗口管理器引用
 */
export function setWindowManager(manager: typeof windowManager): void {
  windowManager = manager
}

/**
 * 获取动作处理函数
 */
function getActionHandler(action: ShortcutAction): (() => void) | null {
  const actions: Record<ShortcutAction, () => void> = {
    togglePlay: () => windowManager?.send('music-playing-control'),
    playPrev: () => windowManager?.send('music-song-control', 'prev'),
    playNext: () => windowManager?.send('music-song-control', 'next'),
    volumeUp: () => windowManager?.send('music-volume-up'),
    volumeDown: () => windowManager?.send('music-volume-down'),
    seekBack: () => windowManager?.send('music-process-control', 'back'),
    seekForward: () => windowManager?.send('music-process-control', 'forward'),
    toggleCompact: () => windowManager?.send('hide-player')
  }

  return actions[action] || null
}

/**
 * 注册全局快捷键
 */
export function registerShortcuts(shortcuts: ShortcutConfig[]): void {
  for (const shortcut of shortcuts) {
    if (!shortcut.globalKeys || shortcut.globalKeys.length === 0) continue

    const handler = getActionHandler(shortcut.action)
    if (!handler) continue

    for (const key of shortcut.globalKeys) {
      try {
        globalShortcut.register(key, handler)
        logger.info(`[Shortcuts] Registered: ${key} -> ${shortcut.action}`)
      } catch (e: unknown) {
        const error = e as Error
        logger.warn(`[Shortcuts] Failed to register ${key}: ${error.message}`)
      }
    }
  }
}

/**
 * 注销所有全局快捷键
 */
export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  logger.info('[Shortcuts] All shortcuts unregistered')
}

/**
 * 注销指定快捷键
 */
export function unregisterShortcut(key: string): void {
  globalShortcut.unregister(key)
  logger.info(`[Shortcuts] Unregistered: ${key}`)
}

/**
 * 检查快捷键是否已注册
 */
export function isShortcutRegistered(key: string): boolean {
  return globalShortcut.isRegistered(key)
}
