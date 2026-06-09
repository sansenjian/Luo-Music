/**
 * 日志记录中间件
 */

import type { IpcMiddleware } from '../IpcService'
import logger from '../../logger'
import { shouldLogIpcDebug } from '../ipcDebugLog'

export const loggerMiddleware: IpcMiddleware<'invoke' | 'send' | 'receive'> = {
  name: 'logger',
  type: 'invoke',

  process(channel, data, next, context) {
    if (shouldLogIpcDebug(channel)) {
      logger.debug(`[IPC] ${channel} [${context.requestId}]:`, JSON.stringify(data))
    }
    void next()
  }
}
