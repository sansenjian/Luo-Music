import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoggerService, LogLevel } from '@/services/loggerService'

describe('loggerService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates stable resource loggers and forwards structured entries to main process', () => {
    const send = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { send }
    })

    const service = createLoggerService()
    const loggerA = service.createLogger('search')
    const loggerB = service.getLogger('search')

    expect(loggerA).toBe(loggerB)

    loggerA.info('query started', { keyword: 'jay' })

    expect(send).toHaveBeenCalledWith(
      'log-message',
      expect.objectContaining({
        source: 'renderer',
        resource: 'search',
        level: LogLevel.Info,
        message: 'query started',
        args: [{ keyword: 'jay' }]
      })
    )
  })

  it('supports legacy module-style calls for backwards compatibility', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })

    const service = createLoggerService()
    service.info('playerStore', 'song changed', { id: 1 })

    expect(info).toHaveBeenCalledWith('%c [INFO] [playerStore] song changed', 'color: #2196F3', {
      id: 1
    })
  })

  it('respects global and per-resource log levels', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })

    const service = createLoggerService()
    const searchLogger = service.createLogger('search')

    service.setLevel(LogLevel.Error)
    searchLogger.info('hidden')
    expect(info).not.toHaveBeenCalled()

    service.setLevel(LogLevel.Debug, 'search')
    searchLogger.info('visible again')
    searchLogger.error('failed', { code: 500 })

    expect(info).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })
})
