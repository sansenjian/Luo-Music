import { ipcRenderer } from 'electron'
import {
  isValidInvokeChannel,
  isValidSendChannel,
  isValidReceiveChannel,
  type InvokeChannel,
  type SendChannel,
  type ReceiveChannel
} from '../../shared/protocol/channels'

export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export type Channel = InvokeChannel | SendChannel | ReceiveChannel

export class IpcProxy {
  private readonly ipcRenderer: Electron.IpcRenderer

  constructor() {
    if (!ipcRenderer) {
      throw new Error('[IpcProxy] ipcRenderer not available')
    }
    this.ipcRenderer = ipcRenderer
  }

  async invoke<T>(channel: Channel, ...args: unknown[]): Promise<T> {
    if (!isValidInvokeChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid invoke channel: ${channel}`)
    }

    try {
      const result = await this.ipcRenderer.invoke(channel, ...args)
      // 运行时基本验证：确保结果不是 null/undefined 除非通道允许
      if (result === null || result === undefined) {
        // 允许 null/undefined 返回，由调用方自行处理
        return result as T
      }
      // 对于对象类型，确保不是错误对象
      if (typeof result === 'object' && 'error' in result && 'success' in result) {
        // 这是 IpcResult 格式，由调用方自行判断 success 字段
        return result as T
      }
      return result as T
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const wrappedError = new Error(`[IpcProxy] Invoke failed on ${channel}: ${message}`)
      ;(wrappedError as Error & { cause?: unknown }).cause = error
      throw wrappedError
    }
  }

  send(channel: Channel, ...args: unknown[]): void {
    if (!isValidSendChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid send channel: ${channel}`)
    }

    this.ipcRenderer.send(channel, ...args)
  }

  supportsSendChannel(channel: string): channel is SendChannel {
    return isValidSendChannel(channel)
  }

  on<T>(channel: Channel, listener: (data: T) => void): () => void {
    if (!isValidReceiveChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid receive channel: ${channel}`)
    }

    const wrappedListener = (_event: Electron.IpcRendererEvent, data: T) => {
      listener(data)
    }

    this.ipcRenderer.on(channel, wrappedListener)

    return () => {
      this.ipcRenderer.removeListener(channel, wrappedListener)
    }
  }

  once<T>(channel: Channel, listener: (data: T) => void): void {
    if (!isValidReceiveChannel(channel)) {
      throw new Error(`[IpcProxy] Invalid receive channel: ${channel}`)
    }

    this.ipcRenderer.once(channel, (_event: Electron.IpcRendererEvent, data: T) => {
      listener(data)
    })
  }

  removeListener(channel: Channel, listener: (...args: unknown[]) => void): void {
    this.ipcRenderer.removeListener(channel, listener)
  }

  removeAllListeners(channel?: Channel): void {
    if (channel) {
      this.ipcRenderer.removeAllListeners(channel)
    } else {
      this.ipcRenderer.removeAllListeners()
    }
  }
}

let globalIpcProxy: IpcProxy | null = null

export function getIpcProxy(): IpcProxy {
  if (!globalIpcProxy) {
    globalIpcProxy = new IpcProxy()
  }
  return globalIpcProxy
}
