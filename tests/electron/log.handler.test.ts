import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const registerSend = vi.fn()
  const loggerError = vi.fn()
  const writeStructuredLog = vi.fn()
  const captureException = vi.fn()

  return {
    registerSend,
    loggerError,
    writeStructuredLog,
    captureException
  }
})

vi.mock('../../electron/ipc/IpcService', () => ({
  ipcService: {
    registerSend: mocks.registerSend
  }
}))

vi.mock('../../electron/logger', () => ({
  default: {
    error: mocks.loggerError
  },
  Sentry: {
    captureException: mocks.captureException
  },
  writeStructuredLog: mocks.writeStructuredLog
}))

describe('electron/ipc/handlers/log.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers unified handlers for log and error send channels', async () => {
    const { SEND_CHANNELS } = await import('../../electron/shared/protocol/channels')
    const { registerLogHandlers } = await import('../../electron/ipc/handlers/log.handler')

    registerLogHandlers()

    expect(mocks.registerSend).toHaveBeenCalledTimes(2)

    const logHandler = mocks.registerSend.mock.calls.find(
      ([channel]) => channel === SEND_CHANNELS.LOG_MESSAGE
    )?.[1]
    const errorHandler = mocks.registerSend.mock.calls.find(
      ([channel]) => channel === SEND_CHANNELS.ERROR_REPORT
    )?.[1]

    expect(logHandler).toBeTypeOf('function')
    expect(errorHandler).toBeTypeOf('function')

    logHandler?.({
      source: 'renderer',
      resource: 'player',
      level: 'info',
      message: 'track changed',
      timestamp: Date.now()
    })

    expect(mocks.writeStructuredLog).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'player',
        message: 'track changed'
      })
    )

    const scope = {
      setTag: vi.fn(),
      setContext: vi.fn()
    }

    mocks.captureException.mockImplementation((_error, callback) => callback(scope))

    errorHandler?.({
      code: 'PLAYER_ERROR',
      message: 'failed to load',
      stack: 'stack trace',
      data: { id: 1 }
    })

    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[ERROR_REPORT] PLAYER_ERROR: failed to load',
      'stack trace',
      { id: 1 }
    )
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    expect(scope.setTag).toHaveBeenCalledWith('error_code', 'PLAYER_ERROR')
    expect(scope.setContext).toHaveBeenCalledWith('error_data', {
      code: 'PLAYER_ERROR',
      message: 'failed to load',
      stack: 'stack trace',
      data: { id: 1 }
    })
  })
})
