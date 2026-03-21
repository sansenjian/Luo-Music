import { describe, expect, it } from 'vitest'

import { AppError, ErrorCode, Errors } from '../../src/utils/error/types'

describe('error/types', () => {
  it('defines stable transport and domain error codes', () => {
    expect(ErrorCode.NETWORK_OFFLINE).toBe(1001)
    expect(ErrorCode.API_TIMEOUT).toBe(1002)
    expect(ErrorCode.API_RATE_LIMIT).toBe(1003)
    expect(ErrorCode.API_REQUEST_FAILED).toBe(1004)
    expect(ErrorCode.SERVICE_UNAVAILABLE).toBe(1005)
    expect(ErrorCode.SONG_NO_COPYRIGHT).toBe(2001)
    expect(ErrorCode.UNKNOWN_ERROR).toBe(9999)
  })

  it('creates AppError instances with code, message and recoverable flag', () => {
    const error = new AppError(ErrorCode.NETWORK_OFFLINE, 'Network is offline')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.name).toBe('AppError')
    expect(error.code).toBe(ErrorCode.NETWORK_OFFLINE)
    expect(error.message).toBe('Network is offline')
    expect(error.recoverable).toBe(true)
  })

  it('maps user-facing messages for known transport errors', () => {
    expect(new AppError(ErrorCode.API_TIMEOUT, 'Timeout').getUserMessage()).toBe(
      '请求超时，请检查网络'
    )
    expect(new AppError(ErrorCode.API_REQUEST_FAILED, 'Boom').getUserMessage()).toBe(
      '服务请求失败，请稍后重试'
    )
    expect(new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Down').getUserMessage()).toBe(
      '服务暂时不可用，请稍后重试'
    )
  })

  it('falls back to the original message for unmapped codes', () => {
    expect(new AppError(ErrorCode.UNKNOWN_ERROR, 'Unknown failure').getUserMessage()).toBe(
      'Unknown failure'
    )
    expect(new AppError(9998 as ErrorCode, '').getUserMessage()).toBe('操作失败，请重试')
  })

  it('exposes helper factories for common error cases', () => {
    expect(Errors.noCopyright('song123')).toEqual(
      expect.objectContaining({
        code: ErrorCode.SONG_NO_COPYRIGHT,
        message: 'No copyright',
        data: { songId: 'song123' }
      })
    )
    expect(Errors.network()).toEqual(
      expect.objectContaining({
        code: ErrorCode.NETWORK_OFFLINE,
        message: 'Network error'
      })
    )
    expect(Errors.api('boom')).toEqual(
      expect.objectContaining({
        code: ErrorCode.API_REQUEST_FAILED,
        message: 'boom'
      })
    )
    expect(Errors.unavailable('offline')).toEqual(
      expect.objectContaining({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'offline'
      })
    )
    expect(Errors.fatal('crash')).toEqual(
      expect.objectContaining({
        code: ErrorCode.MAIN_PROCESS_CRASH,
        recoverable: false
      })
    )
  })
})
