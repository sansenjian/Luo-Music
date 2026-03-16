/**
 * 错误处理中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'

export const errorMiddleware: IpcMiddleware<'invoke'> = {
  name: 'error-handler',
  type: 'invoke',

  async process(channel, data, next, context) {
    try {
      await next()
    } catch (error) {
      logger.error(`[IpcMiddleware] Error in ${channel} [${context.requestId}]:`, error)

      // 重新抛出格式化的错误
      if (error instanceof Error) {
        throw {
          name: error.name,
          message: error.message,
          stack: error.stack,
          channel,
          requestId: context.requestId
        }
      }
      throw error
    }
  }
}
