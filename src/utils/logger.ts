import { services } from '../services'
import type { LoggerService } from '../services/loggerService'

type LoggerResolver = () => LoggerService

const defaultLoggerResolver: LoggerResolver = () => services.logger()
let loggerResolver: LoggerResolver = defaultLoggerResolver

export function configureLoggerDeps(deps: { resolveLogger?: LoggerResolver }): void {
  if (deps.resolveLogger) {
    loggerResolver = deps.resolveLogger
    _logger = undefined
  }
}

export function resetLoggerDeps(): void {
  loggerResolver = defaultLoggerResolver
  _logger = undefined
}

// Lazy loading to avoid circular dependency
let _logger: LoggerService | undefined
export function getLogger() {
  if (_logger === undefined) {
    _logger = loggerResolver()
  }
  return _logger
}
