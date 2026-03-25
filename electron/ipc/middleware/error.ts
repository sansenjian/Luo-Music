/**
 * 错误处理中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'

/**
 * 增强型错误类，保留原始 Error 能力同时添加 IPC 上下文信息
 */
export class IpcError extends Error {
  public readonly channel: string
  public readonly requestId: string
  public readonly originalError: Error | unknown

  constructor(message: string, channel: string, requestId: string, originalError: Error | unknown) {
    super(message)
    this.name = 'IpcError'
    this.channel = channel
    this.requestId = requestId
    this.originalError = originalError

    // 保持正确的堆栈跟踪
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack
        .replace(originalError.name, this.name)
        .replace(originalError.message, this.message)
    }
  }
}

export const errorMiddleware: IpcMiddleware<'invoke'> = {
  name: 'error-handler',
  type: 'invoke',

  async process(channel, data, next, context) {
    try {
      await next()
    } catch (error) {
      logger.error(`[IpcMiddleware] Error in ${channel} [${context.requestId}]:`, error)

      // 保持 Error 实例，仅添加额外信息
      if (error instanceof Error) {
        throw new IpcError(error.message, channel, context.requestId, error)
      }

      // 非 Error 类型也包装为 IpcError
      throw new IpcError(String(error), channel, context.requestId, error)
    }
  }
}
