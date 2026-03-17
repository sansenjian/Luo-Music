import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { errorCenter } from '../../src/utils/error/center'
import { AppError, ErrorCode } from '../../src/utils/error/types'

// Mock platform 模块
vi.mock('../../src/platform', () => ({
  default: {
    isElectron: () => false,
    send: vi.fn()
  }
}))

describe('error/center', () => {
  // 每个测试后清理所有 handler
  afterEach(() => {
    // 重新创建 errorCenter 实例来清理 handlers
    // 由于 errorCenter 是单例，我们需要通过测试来验证其行为
  })

  describe('errorCenter.on()', () => {
    it('should register handler for specific error code', () => {
      const handler = vi.fn()
      errorCenter.on(ErrorCode.NETWORK_OFFLINE, handler)

      const error = new AppError(ErrorCode.NETWORK_OFFLINE, 'Network error')
      errorCenter.emit(error)

      expect(handler).toHaveBeenCalledWith(error)
    })

    it('should support multiple handlers for same error code', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      errorCenter.on(ErrorCode.SONG_NO_COPYRIGHT, handler1)
      errorCenter.on(ErrorCode.SONG_NO_COPYRIGHT, handler2)

      const error = new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'No copyright')
      errorCenter.emit(error)

      expect(handler1).toHaveBeenCalledWith(error)
      expect(handler2).toHaveBeenCalledWith(error)
    })
  })

  describe('errorCenter.onAny()', () => {
    it('should register global handler that catches all errors', () => {
      const globalHandler = vi.fn()
      errorCenter.onAny(globalHandler)

      const error1 = new AppError(ErrorCode.NETWORK_OFFLINE, 'Network')
      const error2 = new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'Copyright')

      errorCenter.emit(error1)
      errorCenter.emit(error2)

      expect(globalHandler).toHaveBeenCalledTimes(2)
      expect(globalHandler).toHaveBeenCalledWith(error1)
      expect(globalHandler).toHaveBeenCalledWith(error2)
    })

    it('should call both specific and global handlers', () => {
      const specificHandler = vi.fn()
      const globalHandler = vi.fn()

      errorCenter.on(ErrorCode.API_TIMEOUT, specificHandler)
      errorCenter.onAny(globalHandler)

      const error = new AppError(ErrorCode.API_TIMEOUT, 'Timeout')
      errorCenter.emit(error)

      expect(specificHandler).toHaveBeenCalledWith(error)
      expect(globalHandler).toHaveBeenCalledWith(error)
    })
  })

  describe('errorCenter.emit()', () => {
    it('should handle AppError instance', () => {
      const handler = vi.fn()
      errorCenter.on(ErrorCode.AUDIO_DECODE_FAILED, handler)

      const error = new AppError(ErrorCode.AUDIO_DECODE_FAILED, 'Decode failed', true, {
        songId: '123'
      })
      errorCenter.emit(error)

      expect(handler).toHaveBeenCalledWith(error)
    })

    it('should wrap native Error into AppError', () => {
      const globalHandler = vi.fn()
      errorCenter.onAny(globalHandler)

      const nativeError = new Error('Native error message')
      errorCenter.emit(nativeError)

      expect(globalHandler).toHaveBeenCalled()
      const wrappedError = globalHandler.mock.calls[0][0]

      expect(wrappedError).toBeInstanceOf(AppError)
      expect(wrappedError.code).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(wrappedError.message).toBe('Native error message')
      expect(wrappedError.recoverable).toBe(true)
      expect(wrappedError.data).toHaveProperty('stack')
    })

    it('should wrap non-Error values into AppError', () => {
      const globalHandler = vi.fn()
      errorCenter.onAny(globalHandler)

      errorCenter.emit('string error')

      const wrappedError = globalHandler.mock.calls[0][0]
      expect(wrappedError).toBeInstanceOf(AppError)
      expect(wrappedError.code).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(wrappedError.message).toBe('string error')
    })

    it('should wrap null into AppError', () => {
      const globalHandler = vi.fn()
      errorCenter.onAny(globalHandler)

      errorCenter.emit(null)

      const wrappedError = globalHandler.mock.calls[0][0]
      expect(wrappedError.message).toBe('null')
    })

    it('should wrap undefined into AppError', () => {
      const globalHandler = vi.fn()
      errorCenter.onAny(globalHandler)

      errorCenter.emit(undefined)

      const wrappedError = globalHandler.mock.calls[0][0]
      expect(wrappedError.message).toBe('undefined')
    })

    it('should catch errors thrown by handlers', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const badHandler = () => {
        throw new Error('Handler error')
      }
      const goodHandler = vi.fn()

      errorCenter.on(ErrorCode.UNKNOWN_ERROR, badHandler)
      errorCenter.on(ErrorCode.UNKNOWN_ERROR, goodHandler)

      const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Test')

      // 不应抛出错误
      expect(() => errorCenter.emit(error)).not.toThrow()

      // 后续 handler 仍应被调用
      expect(goodHandler).toHaveBeenCalled()

      // 错误应该被记录
      expect(consoleSpy).toHaveBeenCalledWith('Error handler failed:', expect.any(Error))

      consoleSpy.mockRestore()
    })
  })

  describe('execution order', () => {
    it('should execute specific handlers before global handlers', () => {
      const order: string[] = []

      errorCenter.on(ErrorCode.STORAGE_FULL, () => {
        order.push('specific')
      })
      errorCenter.onAny(() => {
        order.push('global')
      })

      const error = new AppError(ErrorCode.STORAGE_FULL, 'Storage full')
      errorCenter.emit(error)

      expect(order).toEqual(['specific', 'global'])
    })
  })
})
