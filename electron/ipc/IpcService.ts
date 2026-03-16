/**
 * IPC 服务 - 统一管理所有 IPC 通道
 *
 * 借鉴 VSCode 的 IpcService 模式：
 * - 集中注册所有处理器
 * - 统一的错误处理和日志记录
 * - 支持中间件
 */

import { ipcMain, BrowserWindow } from 'electron'
import logger from '../logger'

import { INVOKE_CHANNELS, SEND_CHANNELS } from '../shared/protocol/channels.ts'
import type {
  InvokeChannelMap,
  SendChannelMap,
  ReceiveChannelMap,
  InvokeFunction,
  SendFunction,
  ReceiveCallback
} from './types'

// ========== 配置类型 ==========

export interface IpcServiceConfig {
  /** 默认超时时间（毫秒），默认 5000ms */
  defaultTimeout?: number
}

// ========== 中间件类型 ==========

export interface IpcMiddlewareContext {
  /** 请求唯一追踪 ID */
  requestId: string
  /** 请求开始时间戳 */
  startTime: number
  /** 通道名称 */
  channel: string
}

export interface IpcMiddleware<T extends 'invoke' | 'send' | 'receive'> {
  name: string
  process: (
    channel: string,
    data: unknown,
    next: () => void | Promise<void>,
    context: IpcMiddlewareContext
  ) => void | Promise<void>
  type: T
}

// ========== 辅助函数 ==========

/** 生成唯一请求 ID */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// ========== IpcService 类 ==========

export class IpcService {
  private static instance: IpcService | null = null

  private invokeHandlers = new Map<keyof InvokeChannelMap, InvokeFunction<keyof InvokeChannelMap>>()
  private sendHandlers = new Map<keyof SendChannelMap, SendFunction<keyof SendChannelMap>>()
  private receiveHandlers = new Map<
    keyof ReceiveChannelMap,
    Set<ReceiveCallback<keyof ReceiveChannelMap>>
  >()

  private middleware: IpcMiddleware<'invoke' | 'send' | 'receive'>[] = []

  /** 默认超时时间（毫秒） */
  private defaultTimeout: number = 5000

  private initialized = false

  private constructor() {}

  static getInstance(): IpcService {
    if (!IpcService.instance) {
      IpcService.instance = new IpcService()
    }
    return IpcService.instance
  }

  /**
   * 配置 IPC 服务
   */
  configure(config: IpcServiceConfig): void {
    if (config.defaultTimeout !== undefined) {
      this.defaultTimeout = config.defaultTimeout
    }
    logger.info(`[IpcService] Configured with timeout: ${this.defaultTimeout}ms`)
  }

  // ========== 中间件 ==========

  use<T extends 'invoke' | 'send' | 'receive'>(middleware: IpcMiddleware<T>): void {
    this.middleware.push(middleware)
  }

  private async runMiddleware<T extends 'invoke' | 'send' | 'receive'>(
    type: T,
    channel: string,
    data: unknown,
    context: IpcMiddlewareContext
  ): Promise<void> {
    const middlewares = this.middleware.filter(m => m.type === type)
    let index = 0

    const next = async () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++]
        await middleware.process(channel, data, next, context)
      }
    }

    await next()
  }

  /**
   * 创建带超时的 Promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, channel: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Request timeout: ${channel} exceeded ${timeoutMs}ms`))
        }, timeoutMs)
      )
    ])
  }

  // ========== Invoke 处理器注册 ==========

  registerInvoke<T extends keyof InvokeChannelMap>(channel: T, handler: InvokeFunction<T>): void {
    if (this.invokeHandlers.has(channel)) {
      logger.warn(`[IpcService] Invoke handler already registered for channel: ${channel}`)
    }
    this.invokeHandlers.set(channel, handler as InvokeFunction<keyof InvokeChannelMap>)

    // 如果已初始化，立即设置处理器
    if (this.initialized) {
      this.setupInvokeHandler(channel)
    }
  }

  private setupInvokeHandler<T extends keyof InvokeChannelMap>(channel: T): void {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const requestId = generateRequestId()
      const startTime = Date.now()
      const context: IpcMiddlewareContext = { requestId, startTime, channel: channel as string }

      try {
        // 运行中间件
        await this.runMiddleware('invoke', channel, args, context)

        const handler = this.invokeHandlers.get(channel)
        if (!handler) {
          throw new Error(`No handler registered for invoke channel: ${channel}`)
        }

        // 执行处理器并应用超时
        const result = await this.withTimeout(
          handler(...(args as Parameters<InvokeFunction<T>>)),
          this.defaultTimeout,
          channel as string
        )

        const duration = Date.now() - startTime
        logger.debug(`[IPC] ${channel} [${requestId}] completed in ${duration}ms`)

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error(`[IpcService] Invoke error on ${channel} [${requestId}] (${duration}ms):`, error)
        throw error
      }
    })
  }

  // ========== Send 处理器注册 ==========

  registerSend<T extends keyof SendChannelMap>(channel: T, handler: SendFunction<T>): void {
    if (this.sendHandlers.has(channel)) {
      logger.warn(`[IpcService] Send handler already registered for channel: ${channel}`)
    }
    this.sendHandlers.set(channel, handler as SendFunction<keyof SendChannelMap>)

    // 如果已初始化，立即设置处理器
    if (this.initialized) {
      this.setupSendHandler(channel)
    }
  }

  private setupSendHandler<T extends keyof SendChannelMap>(channel: T): void {
    ipcMain.on(channel, async (event, ...args: unknown[]) => {
      const requestId = generateRequestId()
      const startTime = Date.now()
      const context: IpcMiddlewareContext = { requestId, startTime, channel: channel as string }

      try {
        // 运行中间件
        await this.runMiddleware('send', channel, args, context)

        const handler = this.sendHandlers.get(channel)
        if (!handler) {
          logger.warn(`[IpcService] No handler registered for send channel: ${channel}`)
          return
        }

        handler(...(args as Parameters<SendFunction<T>>))

        // 跳过高频事件的日志输出（如歌词更新）
        const shouldLog = channel !== 'lyric-time-update'
        if (shouldLog) {
          const duration = Date.now() - startTime
          logger.debug(`[IPC] ${channel} [${requestId}] handled in ${duration}ms`)
        }
      } catch (error) {
        logger.error(`[IpcService] Send error on ${channel}:`, error)
      }
    })
  }

  // ========== Receive 处理器注册 ==========

  registerReceive<T extends keyof ReceiveChannelMap>(
    channel: T,
    callback: ReceiveCallback<T>
  ): () => void {
    if (!this.receiveHandlers.has(channel)) {
      this.receiveHandlers.set(channel, new Set<ReceiveCallback<keyof ReceiveChannelMap>>())
    }

    const callbacks = this.receiveHandlers.get(channel)!
    callbacks.add(callback as ReceiveCallback<keyof ReceiveChannelMap>)

    logger.debug(`[IpcService] Receive handler registered for ${channel}`)

    // 返回取消订阅函数
    return () => {
      callbacks.delete(callback as ReceiveCallback<keyof ReceiveChannelMap>)
      if (callbacks.size === 0) {
        this.receiveHandlers.delete(channel)
      }
      logger.debug(`[IpcService] Receive handler removed for ${channel}`)
    }
  }

  // ========== 发送消息到渲染进程 ==========

  sendToRenderer<T extends keyof ReceiveChannelMap>(
    window: BrowserWindow,
    channel: T,
    payload: ReceiveChannelMap[T]['payload']
  ): void {
    window.webContents.send(channel, payload)
  }

  // ========== 广播消息到所有渲染进程 ==========

  broadcast<T extends keyof ReceiveChannelMap>(
    channel: T,
    payload: ReceiveChannelMap[T]['payload']
  ): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      this.sendToRenderer(win, channel, payload)
    }
  }

  // ========== 获取处理器状态 ==========

  getHandlerStats(): {
    invokeCount: number
    sendCount: number
    receiveCount: number
    middlewareCount: number
  } {
    return {
      invokeCount: this.invokeHandlers.size,
      sendCount: this.sendHandlers.size,
      receiveCount: this.receiveHandlers.size,
      middlewareCount: this.middleware.length
    }
  }

  // ========== 初始化 ==========

  initialize(): void {
    if (this.initialized) {
      logger.warn('[IpcService] Already initialized')
      return
    }

    logger.info('[IpcService] Initializing...')

    // 设置所有 Invoke 处理器
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      this.setupInvokeHandler(channel)
    }

    // 设置所有 Send 处理器
    for (const channel of Object.values(SEND_CHANNELS)) {
      this.setupSendHandler(channel)
    }

    this.initialized = true

    const stats = this.getHandlerStats()
    logger.info(
      `[IpcService] Initialized with ${stats.invokeCount} invoke, ${stats.sendCount} send handlers, ${stats.middlewareCount} middlewares`
    )
  }

  // ========== 清理 ==========

  dispose(): void {
    logger.info('[IpcService] Disposing...')

    // 移除所有 Invoke 处理器
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }

    this.invokeHandlers.clear()
    this.sendHandlers.clear()
    this.receiveHandlers.clear()
    this.middleware = []
    this.initialized = false

    logger.info('[IpcService] Disposed')
  }
}

// ========== 导出单例 ==========

export const ipcService = IpcService.getInstance()
