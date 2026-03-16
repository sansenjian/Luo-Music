import type * as SentryMain from '@sentry/electron/main'
import log from 'electron-log'
import { LogLevel, type LogEntry } from './shared/log'

let Sentry: typeof SentryMain | null = null
let sentryInitialized = false

// Configure electron-log
log.transports.file.level = 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// Daily log file name
const date = new Date().toISOString().split('T')[0]
log.transports.file.fileName = `main-${date}.log`

export async function initSentry(options: { dsn?: string; force?: boolean } = {}): Promise<void> {
  if (sentryInitialized && !options.force) return

  const dsn = options.dsn || process.env.SENTRY_DSN
  if (!dsn) {
    log.info('Sentry skipped (no DSN)')
    return
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  if (isTestEnv && !options.force) {
    log.info('Sentry skipped (test env)')
    return
  }

  try {
    const [{ app }, sentry] = await Promise.all([
      import('electron'),
      import('@sentry/electron/main')
    ])
    const isPackaged = app?.isPackaged ?? false
    const version = app?.getVersion?.() ?? '0.0.0'
    const release = process.env.SENTRY_RELEASE || `luo-music@${version}`
    const environment = process.env.NODE_ENV || (isPackaged ? 'production' : 'development')

    Sentry = sentry as typeof SentryMain
    Sentry.init({
      dsn,
      release,
      environment,
      debug: environment === 'development'
    })

    Sentry.setTags({
      'process.type': 'main',
      platform: process.platform,
      'app.version': version,
      'app.environment': environment,
      'app.release': release
    })

    Sentry.setContext('app', {
      name: app?.getName?.() ?? 'luo-music',
      version,
      release
    })

    Sentry.setContext('runtime', {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron
    })

    sentryInitialized = true
    log.info('Sentry initialized')
  } catch (error) {
    log.error('Failed to initialize Sentry', error)
  }
}

function formatStructuredPrefix(entry: LogEntry): string {
  return `[${entry.source}:${entry.resource}] ${entry.message}`
}

export function writeStructuredLog(entry: LogEntry): void {
  const text = formatStructuredPrefix(entry)
  const args = entry.args ?? []

  switch (entry.level) {
    case LogLevel.Trace:
    case LogLevel.Debug:
      log.debug(text, ...args)
      break
    case LogLevel.Info:
      log.info(text, ...args)
      break
    case LogLevel.Warn:
      log.warn(text, ...args)
      break
    case LogLevel.Error:
      log.error(text, ...args)
      break
  }
}

export default log
export { Sentry }
