import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleApiError } from '../../src/api/responseHandler'

describe('responseHandler handleApiError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns canceled error without emitting api error log', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = handleApiError(
      {
        code: 'ERR_CANCELED',
        message: 'canceled',
        name: 'CanceledError'
      },
      'Netease'
    )

    expect(error.message).toBe('Netease: canceled')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('keeps logging for non-canceled errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = handleApiError(new Error('boom'), 'Netease')

    expect(error.message).toContain('Netease:')
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })
})
