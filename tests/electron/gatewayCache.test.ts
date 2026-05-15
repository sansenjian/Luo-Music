import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_DEFAULT_RETRY_DELAY } from '@/constants/http'
import { executeWithRetry } from '../../electron/ipc/utils/gatewayCache.ts'

vi.mock('../../electron/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('gatewayCache executeWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not retry non-retryable 500 responses that merely contain timeout fields in their payload', async () => {
    const upstreamError = Object.assign(
      new Error('QQ service request failed with status 500: {"config":{"timeout":15000}}'),
      {
        response: {
          status: 500
        }
      }
    )
    const request = vi.fn().mockRejectedValue(upstreamError)

    await expect(executeWithRetry(request, 'api:request qq:getSearchByKey')).rejects.toBe(
      upstreamError
    )
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retries transient upstream 503 responses', async () => {
    const transientError = Object.assign(new Error('QQ service request failed with status 503'), {
      response: {
        status: 503
      }
    })
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('ok')

    const task = executeWithRetry(request, 'api:request qq:getSearchByKey')
    await vi.advanceTimersByTimeAsync(HTTP_DEFAULT_RETRY_DELAY)

    await expect(task).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('retries genuine timeout failures without an HTTP response', async () => {
    const timeoutError = new Error('timeout of 15000ms exceeded')
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce('ok')

    const task = executeWithRetry(request, 'api:request qq:getSearchByKey')
    await vi.advanceTimersByTimeAsync(HTTP_DEFAULT_RETRY_DELAY)

    await expect(task).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not retry local service timeout errors', async () => {
    const timeoutError = Object.assign(new Error('QQ local service timeout'), {
      code: 'LOCAL_SERVICE_TIMEOUT'
    })
    const request = vi.fn().mockRejectedValue(timeoutError)

    await expect(executeWithRetry(request, 'api:request qq:getSearchByKey')).rejects.toBe(
      timeoutError
    )
    expect(request).toHaveBeenCalledTimes(1)
  })
})
