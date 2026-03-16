export const LogLevel = {
  Trace: 'trace',
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
  Off: 'off'
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]
export type ActiveLogLevel = Exclude<LogLevel, typeof LogLevel.Off>
export type LogSource = 'renderer' | 'main' | 'sandbox'

export interface LogEntry {
  level: ActiveLogLevel
  resource: string
  message: string
  args?: unknown[]
  timestamp: number
  source: LogSource
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.Trace]: 0,
  [LogLevel.Debug]: 1,
  [LogLevel.Info]: 2,
  [LogLevel.Warn]: 3,
  [LogLevel.Error]: 4,
  [LogLevel.Off]: 5
}

export function shouldLog(level: ActiveLogLevel, threshold: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[threshold]
}

