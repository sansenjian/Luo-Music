/**
 * IPC 服务代理 - 渲染进程的安全 IPC 调用层
 *
 * 功能：
 * 1. 封装 electron IPC 调用
 * 2. 验证通道名称
 * 3. 统一错误处理
 * 4. 类型安全的调用接口
 */

import { ipcRenderer } from 'electron'
import {
  isValidInvokeChannel,
  isValidSendChannel,
  isValidReceiveChannel,
  type InvokeChannel,
  type SendChannel,
  type ReceiveChannel
} from '../../shared/protocol/channels'

/**
 * IPC 调用结果类型
 */
export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 所有通道类型的联合
 */
export type Channel = InvokeChannel | SendChannel | ReceiveChannel

/**
 * IPC 服务代理类
 *
 * 用法：
 * ```typescript
 * const ipcProxy = new IpcProxy()
 *
 * // Invoke 调用（有返回值）
 * const result = await ipcProxy.invoke<PlaylistData>('player:get-playlist', { id: '123' })
 *
 * // Send 调用（无返回值）
 * ipcProxy.send('window:minimize')
 * ```
 */
export class IpcProxy {
  private readonly ipcRenderer: Electron.IpcRenderer

  constructor() {
    if (!ipcRenderer) {
      throw new Error('[IpcProxy] ipcRenderer not available')
    }
    this.ipcRenderer = ipcRenderer
  }

  /**
   * Invoke 调用 - 发送请求并等待响应
   *
   * @param channel - IPC 通道名
   * @param args - 参数
   * @returns Promise 返回结果
   *
   * @example
   * ```typescript
   * const playlist = await ipcProxy.invoke<PlaylistData>('player:get-playlist', { id: '123' })
   * ```
   */
  async invoke<T>(channel: Channel, ...args: unknown[]): Promise<T> {
    // 验证通道
    if (!isValidInvokeChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid invoke channel: ${channel}`)
    }

    try {
      const result = await this.ipcRenderer.invoke(channel, ...args)
      return result as T
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`[IpcProxy] Invoke failed on ${channel}: ${message}`, { cause: error })
    }
  }

  /**
   * Send 调用 - 发送消息不等待响应
   *
   * @param channel - IPC 通道名
   * @param args - 参数
   *
   * @example
   * ```typescript
   * ipcProxy.send('window:minimize')
   * ```
   */
  send(channel: Channel, ...args: unknown[]): void {
    // 验证通道
    if (!isValidSendChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid send channel: ${channel}`)
    }

    this.ipcRenderer.send(channel, ...args)
  }

  /**
   * On 监听 - 接收主进程推送的消息
   *
   * @param channel - IPC 通道名
   * @param listener - 回调函数
   * @returns 取消监听函数
   *
   * @example
   * ```typescript
   * const unsubscribe = ipcProxy.on('player:track-changed', (data) => {
   *   console.log('Track changed:', data)
   * })
   * ```
   */
  on<T>(channel: Channel, listener: (data: T) => void): () => void {
    // 验证通道
    if (!isValidReceiveChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid receive channel: ${channel}`)
    }

    const wrappedListener = (_event: Electron.IpcRendererEvent, data: T) => {
      listener(data)
    }

    this.ipcRenderer.on(channel, wrappedListener)

    // 返回取消监听函数
    return () => {
      this.ipcRenderer.removeListener(channel, wrappedListener)
    }
  }

  /**
   * Once 监听 - 只监听一次消息
   *
   * @param channel - IPC 通道名
   * @param listener - 回调函数
   */
  once<T>(channel: Channel, listener: (data: T) => void): void {
    if (!isValidReceiveChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid receive channel: ${channel}`)
    }

    this.ipcRenderer.once(channel, (_event: Electron.IpcRendererEvent, data: T) => {
      listener(data)
    })
  }

  /**
   * RemoveListener - 移除监听器
   *
   * @param channel - IPC 通道名
   * @param listener - 回调函数
   */
  removeListener(channel: Channel, listener: (...args: unknown[]) => void): void {
    this.ipcRenderer.removeListener(channel, listener)
  }

  /**
   * RemoveAllListeners - 移除所有监听器
   *
   * @param channel - IPC 通道名
   */
  removeAllListeners(channel?: Channel): void {
    if (channel) {
      this.ipcRenderer.removeAllListeners(channel)
    } else {
      this.ipcRenderer.removeAllListeners()
    }
  }
}

/**
 * 全局 IPC 代理实例
 */
let globalIpcProxy: IpcProxy | null = null

/**
 * 获取全局 IPC 代理
 */
export function getIpcProxy(): IpcProxy {
  if (!globalIpcProxy) {
    globalIpcProxy = new IpcProxy()
  }
  return globalIpcProxy
}
