import { describe, expect, it } from 'vitest'

import { isRecoverableQQLoginError } from '../../src/api/qqmusic'
import { AppError, ErrorCode } from '../../src/utils/error/types'

describe('qqmusic isRecoverableQQLoginError', () => {
  it('treats transport-level connection failures as recoverable', () => {
    expect(isRecoverableQQLoginError({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isRecoverableQQLoginError({ code: 'ENOTFOUND' })).toBe(true)
    expect(isRecoverableQQLoginError({ code: 'EAI_AGAIN' })).toBe(true)
  })

  it('treats normalized AppError service failures as recoverable', () => {
    const unavailableError = new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'qq backend unavailable')
    const timeoutError = new AppError(ErrorCode.API_TIMEOUT, 'qq request timeout')

    expect(isRecoverableQQLoginError(unavailableError)).toBe(true)
    expect(isRecoverableQQLoginError(timeoutError)).toBe(true)
  })

  it('treats response status 5xx and wrapped code fields as recoverable', () => {
    expect(
      isRecoverableQQLoginError({
        data: {
          status: 503
        }
      })
    ).toBe(true)

    expect(
      isRecoverableQQLoginError({
        data: {
          responseData: {
            code: 'ECONNREFUSED'
          }
        }
      })
    ).toBe(true)
  })

  it('keeps unrelated errors non-recoverable', () => {
    expect(isRecoverableQQLoginError(new Error('permission denied'))).toBe(false)
    expect(isRecoverableQQLoginError({ code: 'EACCES' })).toBe(false)
  })
})
