import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServiceMock = vi.hoisted(() => vi.fn())
const emitMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn())
const onAnyMock = vi.hoisted(() => vi.fn())
const handleErrorMock = vi.hoisted(() => vi.fn())
const handleApiErrorMock = vi.hoisted(() => vi.fn())
const handlePlayerErrorMock = vi.hoisted(() => vi.fn())
const handleNetworkErrorMock = vi.hoisted(() => vi.fn())
const withErrorHandlingMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/registry', () => ({
  getService: getServiceMock
}))

vi.mock('@/utils/error', () => ({
  AppError: class MockAppError extends Error {},
  ErrorCode: {
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  },
  Errors: {
    fatal: vi.fn()
  },
  errorCenter: {
    emit: emitMock,
    on: onMock,
    onAny: onAnyMock
  },
  handleApiError: handleApiErrorMock,
  handleError: handleErrorMock,
  handleNetworkError: handleNetworkErrorMock,
  handlePlayerError: handlePlayerErrorMock,
  withErrorHandling: withErrorHandlingMock
}))

describe('configService / errorService / decorators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns environment config and declared service ports', async () => {
    const { createConfigService } = await import('@/services/configService')
    const service = createConfigService()

    expect(service.get()).toEqual(
      expect.objectContaining({
        ports: {
          qq: 3200,
          netease: 14532
        }
      })
    )
    expect(service.getPort('qq')).toBe(3200)
    expect(service.getPort('netease')).toBe(14532)
  })

  it('proxies error helpers through createErrorService', async () => {
    const { createErrorService } = await import('@/services/errorService')
    const service = createErrorService()
    const error = new Error('boom')

    service.emit(error)
    service.on('UNKNOWN_ERROR' as never, vi.fn())
    service.onAny(vi.fn())

    expect(emitMock).toHaveBeenCalledWith(error)
    expect(onMock).toHaveBeenCalled()
    expect(onAnyMock).toHaveBeenCalled()
    expect(service.handleError).toBe(handleErrorMock)
    expect(service.handleApiError).toBe(handleApiErrorMock)
    expect(service.handlePlayerError).toBe(handlePlayerErrorMock)
    expect(service.handleNetworkError).toBe(handleNetworkErrorMock)
    expect(service.withErrorHandling).toBe(withErrorHandlingMock)
  })

  it('injects and resolves services through decorators helpers', async () => {
    const injectedService = { name: 'api-service' }
    getServiceMock.mockReturnValue(injectedService)

    const { inject, useService, createService, createDecorator } = await import('@/services/decorators')
    const token = createDecorator<typeof injectedService>('ITestService')

    class Example {
      declare api: typeof injectedService
    }

    inject(token)(Example.prototype, 'api')
    const instance = new Example()

    expect(instance.api).toBe(injectedService)
    expect(useService(token)).toBe(injectedService)

    class Greeter {
      constructor(public readonly message: string) {}
    }

    const WrappedGreeter = createService(Greeter)
    expect(new WrappedGreeter('hello').message).toBe('hello')
  })
})
