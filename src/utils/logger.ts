import { services } from '../services'
import type { LoggerService } from '../services/loggerService'

// Lazy loading to avoid circular dependency
let _logger: LoggerService | undefined
export function getLogger() {
  if (_logger === undefined) {
    _logger = services.logger()
  }
  return _logger
}
