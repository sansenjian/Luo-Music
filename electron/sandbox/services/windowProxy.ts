/**
 * 窗口服务代理 - 渲染进程的窗口控制层
 *
 * 功能：
 * 1. 窗口基本操作（最小化、最大化、关闭）
 * 2. 窗口状态获取
 * 3. 桌面歌词窗口控制
 */

import { getIpcProxy } from './ipcProxy'
import { SEND_CHANNELS, INVOKE_CHANNELS } from '../../shared/protocol/channels'

/**
 * 窗口状态
 */
export interface WindowState {
  isMaximized: boolean
  isMinimized: boolean
  isFullScreen: boolean
  isAlwaysOnTop: boolean
}

/**
 * 窗口服务代理类
 *
 * 用法：
 * ```typescript
 * const windowProxy = new WindowProxy()
 *
 * // 基本控制
 * await windowProxy.minimize()
 * await windowProxy.maximize()
 * await windowProxy.close()
 *
 * // 状态查询
 * const state = await windowProxy.getState()
 *
 * // 桌面歌词
 * await windowProxy.toggleDesktopLyric(true)
 * ```
 */
export class WindowProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>

  constructor() {
    this.ipcProxy = getIpcProxy()
  }

  /**
   * 最小化窗口
   */
  minimize(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_MINIMIZE)
  }

  /**
   * 最大化/还原窗口
   */
  toggleMaximize(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_MAXIMIZE)
  }

  /**
   * 关闭应用
   */
  close(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_CLOSE)
  }

  /**
   * 最小化到托盘
   */
  minimizeToTray(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_MINIMIZE_TO_TRAY)
  }

  /**
   * 设置窗口置顶
   *
   * @param alwaysOnTop - 是否置顶
   */
  setAlwaysOnTop(alwaysOnTop: boolean): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, alwaysOnTop)
  }

  /**
   * 切换全屏
   */
  toggleFullScreen(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_TOGGLE_FULLSCREEN)
  }

  /**
   * 获取窗口状态
   */
  async getState(): Promise<WindowState> {
    return this.ipcProxy.invoke<WindowState>(INVOKE_CHANNELS.WINDOW_GET_STATE)
  }

  /**
   * 检查是否已最大化
   */
  async isMaximized(): Promise<boolean> {
    const state = await this.getState()
    return state.isMaximized
  }

  /**
   * 检查是否已最小化
   */
  async isMinimized(): Promise<boolean> {
    const state = await this.getState()
    return state.isMinimized
  }

  /**
   * 检查是否全屏
   */
  async isFullScreen(): Promise<boolean> {
    const state = await this.getState()
    return state.isFullScreen
  }

  /**
   * 恢复窗口
   */
  restore(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_RESTORE)
  }

  /**
   * 显示窗口
   */
  show(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_SHOW)
  }

  /**
   * 隐藏窗口
   */
  hide(): void {
    this.ipcProxy.send(SEND_CHANNELS.WINDOW_HIDE)
  }

  /**
   * 设置桌面歌词显示状态
   *
   * @param show - 是否显示
   */
  async toggleDesktopLyric(show?: boolean): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.LYRIC_TOGGLE, show)
  }

  /**
   * 设置桌面歌词置顶状态
   *
   * @param alwaysOnTop - 是否置顶
   */
  async setDesktopLyricOnTop(alwaysOnTop: boolean): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.LYRIC_SET_ALWAYS_ON_TOP, alwaysOnTop)
  }

  /**
   * 锁定/解锁桌面歌词
   *
   * @param locked - 是否锁定
   */
  async lockDesktopLyric(locked: boolean): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.LYRIC_LOCK, locked)
  }
}

/**
 * 全局窗口代理实例
 */
let globalWindowProxy: WindowProxy | null = null

/**
 * 获取全局窗口代理
 */
export function getWindowProxy(): WindowProxy {
  if (!globalWindowProxy) {
    globalWindowProxy = new WindowProxy()
  }
  return globalWindowProxy
}
