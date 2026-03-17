import type { Event } from '../base/common/event/event'
import { EventEmitter } from '../base/common/event/event'
import { Disposable } from '../base/common/lifecycle/disposable'
import {
  LogLevel as LogLevels,
  type ActiveLogLevel,
  type LogEntry,
  type LogLevel,
  shouldLog
} from '../../electron/shared/log'

export { LogLevels as LogLevel }
export type { LogEntry, LogLevel as LogLevelValue }

export interface ILogger {
  readonly resource: string

  setLevel(level: LogLevel): void
  getLevel(): LogLevel

  trace(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void

  flush(): void
  dispose(): void
}

export interface ILoggerService {
  readonly onDidChangeLogLevel: Event<{ resource?: string; level: LogLevel }>

  createLogger(resource: string, options?: { level?: LogLevel }): ILogger
  getLogger(resource: string): ILogger
  hasLogger(resource: string): boolean
  setLevel(level: LogLevel, resource?: string): void
  getLevel(resource?: string): LogLevel
  flush(): void
}

export interface ILogService extends ILogger {
  readonly onDidChangeLogLevel: Event<{ resource?: string; level: LogLevel }>

  trace(message: string, ...args: unknown[]): void
  trace(resource: string, message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  debug(resource: string, message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  info(resource: string, message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  warn(resource: string, message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  error(resource: string, message: string, ...args: unknown[]): void
}

export type LoggerService = ILogService & ILoggerService

type BrowserConsoleMethod = 'debug' | 'info' | 'warn' | 'error'

interface LogSink {
  log(entry: LogEntry): void
  flush(): void
  dispose(): void
}

const DEFAULT_LOG_RESOURCE = 'app'
const CONSOLE_COLORS: Record<ActiveLogLevel, string> = {
  [LogLevels.Trace]: '#9E9E9E',
  [LogLevels.Debug]: '#607D8B',
  [LogLevels.Info]: '#2196F3',
  [LogLevels.Warn]: '#FF9800',
  [LogLevels.Error]: '#F44336'
}

function isDev(): boolean {
  return import.meta.env.DEV
}

function getElectronBridge(): { send?: (channel: string, data?: unknown) => void } | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (
    window as unknown as { electronAPI?: { send?: (channel: string, data?: unknown) => void } }
  ).electronAPI
}

function supportsMainProcessLogging(): boolean {
  return typeof getElectronBridge()?.send === 'function'
}

function shouldUseConsoleSink(): boolean {
  return isDev() || !supportsMainProcessLogging()
}

function normalizeArgs(args: unknown[]): unknown[] | undefined {
  const normalized = args.filter(arg => arg !== undefined)
  return normalized.length > 0 ? normalized : undefined
}

function toConsoleMethod(level: ActiveLogLevel): BrowserConsoleMethod {
  switch (level) {
    case LogLevels.Trace:
    case LogLevels.Debug:
      return 'debug'
    case LogLevels.Info:
      return 'info'
    case LogLevels.Warn:
      return 'warn'
    case LogLevels.Error:
      return 'error'
  }
}

class ConsoleLogSink implements LogSink {
  log(entry: LogEntry): void {
    const method = toConsoleMethod(entry.level)
    const prefix = `%c [${entry.level.toUpperCase()}] [${entry.resource}] ${entry.message}`
    console[method](prefix, `color: ${CONSOLE_COLORS[entry.level]}`, ...(entry.args ?? []))
  }

  flush(): void {}

  dispose(): void {}
}

class MainProcessLogSink implements LogSink {
  log(entry: LogEntry): void {
    getElectronBridge()?.send?.('log-message', entry)
  }

  flush(): void {}

  dispose(): void {}
}

class MultiplexLogSink extends Disposable implements LogSink {
  constructor(private readonly sinks: LogSink[]) {
    super()
  }

  log(entry: LogEntry): void {
    for (const sink of this.sinks) {
      sink.log(entry)
    }
  }

  flush(): void {
    for (const sink of this.sinks) {
      sink.flush()
    }
  }

  override dispose(): void {
    for (const sink of this.sinks) {
      sink.dispose()
    }
    super.dispose()
  }
}

class ResourceLogger extends Disposable implements ILogger {
  private levelOverride?: LogLevel

  constructor(
    readonly resource: string,
    private readonly resolveLevel: () => LogLevel,
    private readonly onDidEmit: (entry: LogEntry) => void,
    level?: LogLevel
  ) {
    super()
    this.levelOverride = level
  }

  setLevel(level: LogLevel): void {
    this.levelOverride = level
  }

  getLevel(): LogLevel {
    return this.levelOverride ?? this.resolveLevel()
  }

  trace(message: string, ...args: unknown[]): void {
    this.log(LogLevels.Trace, message, ...args)
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevels.Debug, message, ...args)
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevels.Info, message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevels.Warn, message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevels.Error, message, ...args)
  }

  flush(): void {}

  private log(level: ActiveLogLevel, message: string, ...args: unknown[]): void {
    if (!shouldLog(level, this.getLevel())) {
      return
    }

    this.onDidEmit({
      source: 'renderer',
      resource: this.resource,
      level,
      message,
      args: normalizeArgs(args),
      timestamp: Date.now()
    })
  }
}

class LoggerServiceImpl extends Disposable implements LoggerService {
  private readonly sink: MultiplexLogSink
  private readonly loggers = new Map<string, ResourceLogger>()
  private readonly onDidChangeLogLevelEmitter = new EventEmitter<{
    resource?: string
    level: LogLevel
  }>()
  private globalLevel: LogLevel = isDev() ? LogLevels.Debug : LogLevels.Info
  private readonly defaultLogger: ResourceLogger

  readonly resource = DEFAULT_LOG_RESOURCE
  readonly onDidChangeLogLevel = this.onDidChangeLogLevelEmitter.event

  constructor() {
    super()

    const sinks: LogSink[] = []
    if (shouldUseConsoleSink()) {
      sinks.push(new ConsoleLogSink())
    }
    if (supportsMainProcessLogging()) {
      sinks.push(new MainProcessLogSink())
    }

    this.sink = new MultiplexLogSink(sinks)
    this.defaultLogger = this.createLogger(DEFAULT_LOG_RESOURCE) as ResourceLogger
  }

  createLogger(resource: string, options: { level?: LogLevel } = {}): ILogger {
    const existing = this.loggers.get(resource)
    if (existing) {
      if (options.level) {
        existing.setLevel(options.level)
      }
      return existing
    }

    const logger = new ResourceLogger(
      resource,
      () => this.globalLevel,
      entry => this.sink.log(entry),
      options.level
    )

    this.loggers.set(resource, logger)
    return logger
  }

  getLogger(resource: string): ILogger {
    return this.createLogger(resource)
  }

  hasLogger(resource: string): boolean {
    return this.loggers.has(resource)
  }

  setLevel(level: LogLevel, resource?: string): void {
    if (resource) {
      const logger = this.createLogger(resource)
      logger.setLevel(level)
      this.onDidChangeLogLevelEmitter.fire({ resource, level })
      return
    }

    this.globalLevel = level
    this.onDidChangeLogLevelEmitter.fire({ level })
  }

  getLevel(resource?: string): LogLevel {
    if (resource && this.loggers.has(resource)) {
      return this.loggers.get(resource)!.getLevel()
    }

    return this.globalLevel
  }

  trace(messageOrResource: string, messageOrArg?: unknown, ...args: unknown[]): void {
    this.logWithLegacySupport(LogLevels.Trace, messageOrResource, messageOrArg, ...args)
  }

  debug(messageOrResource: string, messageOrArg?: unknown, ...args: unknown[]): void {
    this.logWithLegacySupport(LogLevels.Debug, messageOrResource, messageOrArg, ...args)
  }

  info(messageOrResource: string, messageOrArg?: unknown, ...args: unknown[]): void {
    this.logWithLegacySupport(LogLevels.Info, messageOrResource, messageOrArg, ...args)
  }

  warn(messageOrResource: string, messageOrArg?: unknown, ...args: unknown[]): void {
    this.logWithLegacySupport(LogLevels.Warn, messageOrResource, messageOrArg, ...args)
  }

  error(messageOrResource: string, messageOrArg?: unknown, ...args: unknown[]): void {
    this.logWithLegacySupport(LogLevels.Error, messageOrResource, messageOrArg, ...args)
  }

  flush(): void {
    this.sink.flush()
  }

  override dispose(): void {
    for (const logger of this.loggers.values()) {
      logger.dispose()
    }
    this.loggers.clear()
    this.onDidChangeLogLevelEmitter.dispose()
    this.sink.dispose()
    super.dispose()
  }

  private logWithLegacySupport(
    level: ActiveLogLevel,
    messageOrResource: string,
    messageOrArg?: unknown,
    ...args: unknown[]
  ): void {
    if (typeof messageOrArg === 'string') {
      this.dispatch(level, this.getLogger(messageOrResource), messageOrArg, args)
      return
    }

    const mergedArgs = messageOrArg === undefined ? args : [messageOrArg, ...args]
    this.dispatch(level, this.defaultLogger, messageOrResource, mergedArgs)
  }

  private dispatch(level: ActiveLogLevel, logger: ILogger, message: string, args: unknown[]): void {
    switch (level) {
      case LogLevels.Trace:
        logger.trace(message, ...args)
        break
      case LogLevels.Debug:
        logger.debug(message, ...args)
        break
      case LogLevels.Info:
        logger.info(message, ...args)
        break
      case LogLevels.Warn:
        logger.warn(message, ...args)
        break
      case LogLevels.Error:
        logger.error(message, ...args)
        break
    }
  }
}

export function createLoggerService(): LoggerService {
  return new LoggerServiceImpl()
}
