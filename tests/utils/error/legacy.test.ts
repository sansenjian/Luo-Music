import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  handleError,
  handleApiError,
  handlePlayerError,
  handleNetworkError,
  withErrorHandling
} from '@/utils/error/legacy'
import { errorCenter } from '@/utils/error/center'
import { AppError, ErrorCode } from '@/utils/error/types'

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => false),
  send: vi.fn()
}))

vi.mock('@/services/platformAccessor', () => ({
  getPlatformAccessor: () => platformServiceMock
}))

describe('error/legacy', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    emitSpy = vi.spyOn(errorCenter, 'emit').mockImplementation(() => {})
  })

  afterEach(() => {
    emitSpy.mockRestore()
  })

  describe('handleError', () => {
    it('should normalize error and emit by default', () => {
      const error = new Error('Test error')
      const appError = handleError(error)

      expect(appError).toBeInstanceOf(AppError)
      expect(appError.message).toBe('Test error')
      expect(appError.code).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(emitSpy).toHaveBeenCalledWith(appError)
    })

    it('should use custom code and fallback message when error has no message', () => {
      const error = {} as Error
      const appError = handleError(error, {
        code: ErrorCode.NETWORK_OFFLINE,
        customMessage: 'Custom message'
      })

      expect(appError.code).toBe(ErrorCode.NETWORK_OFFLINE)
      expect(appError.message).toBe('Custom message')
    })

    it('should preserve original error message when present', () => {
      const error = new Error('Original message')
      const appError = handleError(error, {
        code: ErrorCode.NETWORK_OFFLINE,
        customMessage: 'Custom message'
      })

      // extractErrorMessage prefers the original error message
      expect(appError.message).toBe('Original message')
      expect(appError.code).toBe(ErrorCode.NETWORK_OFFLINE)
    })

    it('should not emit when emit option is false', () => {
      const error = new Error('Test')
      handleError(error, { emit: false })

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should not emit when error data has silent: true', () => {
      const error = new Error('Test')
      const appError = handleError(error)

      // Manually set silent data
      appError.data = { silent: true }

      // Reset the spy and call handleError with the silent error
      emitSpy.mockClear()
      handleError(appError)

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should call onError callback', () => {
      const onError = vi.fn()
      const error = new Error('Test')

      handleError(error, { onError })

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.any(AppError))
    })

    it('should set recoverable flag', () => {
      const error = new Error('Test')
      const appError = handleError(error, { recoverable: false })

      expect(appError.recoverable).toBe(false)
    })
  })

  describe('handleApiError', () => {
    it('should normalize API error and emit', () => {
      const error = new Error('API failed')
      const appError = handleApiError(error)

      expect(appError).toBeInstanceOf(AppError)
      expect(emitSpy).toHaveBeenCalledWith(appError)
    })

    it('should not emit silent errors', () => {
      const silentError = new AppError(ErrorCode.UNKNOWN_ERROR, 'Silent', true, { silent: true })
      emitSpy.mockClear()

      handleApiError(silentError)

      expect(emitSpy).not.toHaveBeenCalled()
    })
  })

  describe('handlePlayerError', () => {
    it('should create error with AUDIO_DECODE_FAILED code', () => {
      const error = {} as Error
      const appError = handlePlayerError(error)

      expect(appError.code).toBe(ErrorCode.AUDIO_DECODE_FAILED)
      expect(appError.message).toBe('Player error')
    })

    it('should use custom message when provided and error has no message', () => {
      const error = {} as Error
      const appError = handlePlayerError(error, 'Custom player error')

      expect(appError.message).toBe('Custom player error')
    })

    it('should preserve original error message', () => {
      const error = new Error('Original decode error')
      const appError = handlePlayerError(error)

      expect(appError.message).toBe('Original decode error')
      expect(appError.code).toBe(ErrorCode.AUDIO_DECODE_FAILED)
    })
  })

  describe('handleNetworkError', () => {
    it('should create error with NETWORK_OFFLINE code', () => {
      const error = {} as Error
      const appError = handleNetworkError(error)

      expect(appError.code).toBe(ErrorCode.NETWORK_OFFLINE)
      expect(appError.message).toBe('Network error')
    })
  })

  describe('withErrorHandling', () => {
    it('should return result on success', async () => {
      const result = await withErrorHandling(() => Promise.resolve('success'))
      expect(result).toBe('success')
    })

    it('should return null and handle error on failure', async () => {
      const error = new Error('Async failed')
      const result = await withErrorHandling(() => Promise.reject(error))

      expect(result).toBeNull()
      expect(emitSpy).toHaveBeenCalled()
    })

    it('should pass options to handleError', async () => {
      const onError = vi.fn()
      const error = new Error('Test')

      await withErrorHandling(() => Promise.reject(error), { onError })

      expect(onError).toHaveBeenCalled()
    })
  })

  describe('shouldEmit', () => {
    it('should return true when error data is undefined', () => {
      const error = new Error('Test')
      const appError = handleError(error)

      expect(emitSpy).toHaveBeenCalledWith(appError)
    })

    it('should return true when error data is not an object', () => {
      const error = new Error('Test')
      const appError = handleError(error)
      appError.data = 'string data'

      emitSpy.mockClear()
      handleError(appError)

      expect(emitSpy).toHaveBeenCalled()
    })

    it('should return false when error data has silent: true', () => {
      const silentError = new AppError(ErrorCode.UNKNOWN_ERROR, 'Silent', true, { silent: true })
      emitSpy.mockClear()

      handleApiError(silentError)

      expect(emitSpy).not.toHaveBeenCalled()
    })
  })
})
