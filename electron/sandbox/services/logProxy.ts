import { getIpcProxy } from './ipcProxy'
import { SEND_CHANNELS } from '../../shared/protocol/channels'
import {
  LogLevel as LogLevels,
  type LogEntry,
  type LogLevel
} from '../../shared/log'

export { LogLevels as LogLevelValueMap }
export type { LogLevel }
export type LogMessage = LogEntry

export class LogProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>
  private level: LogLevel = LogLevels.Info

  constructor(private readonly resource: string) {
    this.ipcProxy = getIpcProxy()
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  getLevel(): LogLevel {
    return this.level
  }

  trace(message: string, ...args: unknown[]): void {
    this.sendLog(LogLevels.Trace, message, ...args)
  }

  debug(message: string, ...args: unknown[]): void {
    this.sendLog(LogLevels.Debug, message, ...args)
  }

  info(message: string, ...args: unknown[]): void {
    this.sendLog(LogLevels.Info, message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.sendLog(LogLevels.Warn, message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    this.sendLog(LogLevels.Error, message, ...args)
  }

  errorWithStack(error: Error, context?: string): void {
    const message = context ? `${context}: ${error.message}` : error.message
    this.sendLog(LogLevels.Error, message, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(context ? { context } : {})
    })
  }

  private sendLog(
    level: Exclude<LogLevel, typeof LogLevels.Off>,
    message: string,
    ...args: unknown[]
  ): void {
    const entry: LogEntry = {
      level,
      resource: this.resource,
      message,
      args: args.length > 0 ? args : undefined,
      timestamp: Date.now(),
      source: 'sandbox'
    }

    this.ipcProxy.send(SEND_CHANNELS.LOG_MESSAGE, entry as unknown)
  }
}

export function createLogger(module: string): LogProxy {
  return new LogProxy(module)
}
