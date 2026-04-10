import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleApiError } from '@/api/responseHandler'
import { AppError, ErrorCode } from '@/utils/error/types'

describe('responseHandler handleApiError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a silent AppError for canceled requests without logging', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = handleApiError(
      {
        code: 'ERR_CANCELED',
        message: 'canceled',
        name: 'CanceledError'
      },
      'Netease'
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe(ErrorCode.API_REQUEST_FAILED)
    expect(error.message).toBe('Netease: canceled')
    expect(error.data).toEqual(
      expect.objectContaining({
        canceled: true,
        silent: true,
        code: 'ERR_CANCELED'
      })
    )
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('preserves superseded cancellation reason when normalizing errors', () => {
    const error = handleApiError(
      {
        code: 'ERR_CANCELED',
        message: 'canceled',
        name: 'CanceledError',
        reason: 'superseded'
      },
      'Netease'
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error.data).toEqual(
      expect.objectContaining({
        canceled: true,
        silent: true,
        reason: 'superseded'
      })
    )
  })

  it('normalizes non-canceled API errors into AppError instances and keeps logging', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = handleApiError(new Error('boom'), 'Netease')

    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe(ErrorCode.API_REQUEST_FAILED)
    expect(error.message).toBe('Netease: boom')
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })
})
