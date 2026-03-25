import logger, { Sentry, writeStructuredLog } from '../../logger'
import { SEND_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { ErrorReport, LogMessage } from '../types'

export function registerLogHandlers(): void {
  ipcService.registerSend(SEND_CHANNELS.LOG_MESSAGE, (entry: LogMessage) => {
    writeStructuredLog(entry)
  })

  ipcService.registerSend(SEND_CHANNELS.ERROR_REPORT, (errorData: ErrorReport) => {
    const fullMessage = `[ERROR_REPORT] ${errorData.code}: ${errorData.message}`

    logger.error(fullMessage, errorData.stack, errorData.data)

    if (Sentry) {
      Sentry.captureException(new Error(errorData.message), scope => {
        scope.setTag('error_code', errorData.code)
        scope.setContext('error_data', {
          code: errorData.code,
          message: errorData.message,
          stack: errorData.stack,
          data: errorData.data
        })
        return scope
      })
    }
  })
}
