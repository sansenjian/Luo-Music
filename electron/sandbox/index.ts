/**
 * Preload 脚本 - Sandbox 层
 * 
 * 负责安全地暴露主进程能力到渲染进程。
 * 遵循 VSCode 的 Sandbox 模式：
 * - 通道验证：只允许预定义的通道
 * - 类型安全：提供完整的类型定义
 * - 最小权限：只暴露必要的 API
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  SEND_CHANNELS,
  RECEIVE_CHANNELS,
  INVOKE_CHANNELS,
  isValidSendChannel,
  isValidReceiveChannel,
  type SendChannel,
  type ReceiveChannel,
} from '../shared/protocol/channels'

console.log('--- Preload script loaded (TypeScript) ---')

/**
 * 类型定义：渲染进程可用的 Electron API
 */
export interface ElectronAPI {
  // 窗口控制
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  resizeWindow: (dims: { width: number; height: number }) => void

  // 缓存管理
  getCacheSize: () => Promise<number>
  clearCache: (options: { cacheType?: string }) => Promise<void>
  clearAllCache: (keepUserData?: boolean) => Promise<void>
  getCachePaths: () => Promise<Record<string, string>>

  // API 网关
  apiRequest: <T = unknown>(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ) => Promise<T>
  getServices: () => Promise<string[]>

  // 服务管理
  getServiceStatus: (serviceId: string) => Promise<'running' | 'stopped' | 'error'>
  startService: (serviceId: string) => Promise<void>
  stopService: (serviceId: string) => Promise<void>

  // 桌面歌词
  sendPlayingState: (playing: boolean) => void
  sendPlayModeChange: (mode: string) => void
  moveWindow: (x: number, y: number) => void

  // 通用 IPC
  send: (channel: string, data: unknown) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

/**
 * 安全的 IPC 发送函数
 * 验证通道名称后发送消息
 */
function safeSend(channel: string, data: unknown): void {
  if (!isValidSendChannel(channel)) {
    throw new Error(`Invalid send channel: ${channel}`)
  }
  ipcRenderer.send(channel, data)
}

/**
 * 安全的 IPC 监听函数
 * 验证通道名称后注册监听器，返回取消订阅函数
 */
function safeOn(
  channel: string,
  callback: (...args: unknown[]) => void
): () => void {
  if (!isValidReceiveChannel(channel)) {
    throw new Error(`Invalid receive channel: ${channel}`)
  }

  const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    callback(...args)
  }

  ipcRenderer.on(channel, subscription)

  // 返回取消订阅函数
  return () => {
    ipcRenderer.removeListener(channel, subscription)
  }
}

/**
 * 暴露 Electron API 到渲染进程
 */
function exposeAPI(): void {
  const electronAPI: ElectronAPI = {
    // 窗口控制
    minimizeWindow: () => ipcRenderer.send(SEND_CHANNELS.WINDOW_MINIMIZE),
    maximizeWindow: () => ipcRenderer.send(SEND_CHANNELS.WINDOW_MAXIMIZE),
    closeWindow: () => ipcRenderer.send(SEND_CHANNELS.WINDOW_CLOSE),
    resizeWindow: (dims) => ipcRenderer.send(SEND_CHANNELS.WINDOW_RESIZE, dims),

    // 缓存管理
    getCacheSize: () => ipcRenderer.invoke(INVOKE_CHANNELS.CACHE_GET_SIZE),
    clearCache: (options) => ipcRenderer.invoke(INVOKE_CHANNELS.CACHE_CLEAR, options),
    clearAllCache: (keepUserData) =>
      ipcRenderer.invoke(INVOKE_CHANNELS.CACHE_CLEAR_ALL, keepUserData),
    getCachePaths: () => ipcRenderer.invoke(INVOKE_CHANNELS.CACHE_GET_PATHS),

    // API 网关
    apiRequest: (service, endpoint, params) =>
      ipcRenderer.invoke(INVOKE_CHANNELS.API_REQUEST, { service, endpoint, params }),
    getServices: () => ipcRenderer.invoke(INVOKE_CHANNELS.API_GET_SERVICES),

    // 服务管理
    getServiceStatus: (serviceId) =>
      ipcRenderer.invoke(INVOKE_CHANNELS.SERVICE_GET_STATUS, serviceId),
    startService: (serviceId) =>
      ipcRenderer.invoke(INVOKE_CHANNELS.SERVICE_START, serviceId),
    stopService: (serviceId) =>
      ipcRenderer.invoke(INVOKE_CHANNELS.SERVICE_STOP, serviceId),

    // 桌面歌词
    sendPlayingState: (playing) =>
      safeSend(SEND_CHANNELS.MUSIC_PLAYING_CHECK, playing),
    sendPlayModeChange: (mode) =>
      safeSend(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, mode),
    moveWindow: (x, y) =>
      safeSend(SEND_CHANNELS.DESKTOP_LYRIC_MOVE, { x, y }),

    // 通用 IPC
    send: (channel, data) => safeSend(channel, data),
    on: (channel, callback) => safeOn(channel, callback),
  }

  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
}

// 初始化
exposeAPI()

/**
 * 类型声明扩展
 * 将 electronAPI 添加到 window 对象类型
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}