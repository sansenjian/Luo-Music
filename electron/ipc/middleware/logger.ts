/**
 * 日志记录中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'

export const loggerMiddleware: IpcMiddleware<'invoke' | 'send' | 'receive'> = {
  name: 'logger',
  type: 'invoke',

  process(channel, data, next, context) {
    logger.debug(`[IPC] ${channel} [${context.requestId}]:`, JSON.stringify(data))
    void next()
  }
}
