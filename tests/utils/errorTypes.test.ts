import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode, AppError, Errors } from '../../src/utils/error/types'

describe('error/types', () => {
  describe('ErrorCode enum', () => {
    it('should have network layer error codes (1000-1999)', () => {
      expect(ErrorCode.NETWORK_OFFLINE).toBe(1001)
      expect(ErrorCode.API_TIMEOUT).toBe(1002)
      expect(ErrorCode.API_RATE_LIMIT).toBe(1003)
    })

    it('should have business layer error codes (2000-2999)', () => {
      expect(ErrorCode.SONG_NO_COPYRIGHT).toBe(2001)
      expect(ErrorCode.SONG_URL_EXPIRED).toBe(2002)
      expect(ErrorCode.PLAYLIST_NOT_FOUND).toBe(2003)
    })

    it('should have player layer error codes (3000-3999)', () => {
      expect(ErrorCode.AUDIO_DECODE_FAILED).toBe(3001)
      expect(ErrorCode.AUDIO_CONTEXT_SUSPENDED).toBe(3002)
    })

    it('should have system layer error codes (4000-4999)', () => {
      expect(ErrorCode.MAIN_PROCESS_CRASH).toBe(4001)
      expect(ErrorCode.STORAGE_FULL).toBe(4002)
    })

    it('should have unknown error code', () => {
      expect(ErrorCode.UNKNOWN_ERROR).toBe(9999)
    })
  })

  describe('AppError', () => {
    it('should create error with code and message', () => {
      const error = new AppError(ErrorCode.NETWORK_OFFLINE, 'Network is offline')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AppError)
      expect(error.name).toBe('AppError')
      expect(error.code).toBe(ErrorCode.NETWORK_OFFLINE)
      expect(error.message).toBe('Network is offline')
      expect(error.recoverable).toBe(true) // 默认可恢复
    })

    it('should create error with custom recoverable flag', () => {
      const error = new AppError(ErrorCode.MAIN_PROCESS_CRASH, 'Crashed', false)

      expect(error.recoverable).toBe(false)
    })

    it('should create error with additional data', () => {
      const error = new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'No copyright', true, {
        songId: '12345'
      })

      expect(error.data).toEqual({ songId: '12345' })
    })

    it('should have correct stack trace', () => {
      const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Test error')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AppError')
    })
  })

  describe('AppError.getUserMessage()', () => {
    it('should return friendly message for SONG_NO_COPYRIGHT', () => {
      const error = new AppError(ErrorCode.SONG_NO_COPYRIGHT, 'No copyright')
      expect(error.getUserMessage()).toBe('该歌曲暂无版权，已自动跳过')
    })

    it('should return friendly message for NETWORK_OFFLINE', () => {
      const error = new AppError(ErrorCode.NETWORK_OFFLINE, 'Network error')
      expect(error.getUserMessage()).toBe('网络断开，正在重试...')
    })

    it('should return friendly message for AUDIO_DECODE_FAILED', () => {
      const error = new AppError(ErrorCode.AUDIO_DECODE_FAILED, 'Decode failed')
      expect(error.getUserMessage()).toBe('音频解码失败，尝试切换音质')
    })

    it('should return friendly message for API_TIMEOUT', () => {
      const error = new AppError(ErrorCode.API_TIMEOUT, 'Timeout')
      expect(error.getUserMessage()).toBe('请求超时，请检查网络')
    })

    it('should return friendly message for API_RATE_LIMIT', () => {
      const error = new AppError(ErrorCode.API_RATE_LIMIT, 'Rate limited')
      expect(error.getUserMessage()).toBe('请求过于频繁，请稍后再试')
    })

    it('should return friendly message for PLAYLIST_NOT_FOUND', () => {
      const error = new AppError(ErrorCode.PLAYLIST_NOT_FOUND, 'Not found')
      expect(error.getUserMessage()).toBe('找不到该歌单')
    })

    it('should return friendly message for SONG_URL_EXPIRED', () => {
      const error = new AppError(ErrorCode.SONG_URL_EXPIRED, 'URL expired')
      expect(error.getUserMessage()).toBe('歌曲链接已过期，正在刷新')
    })

    it('should return friendly message for AUDIO_CONTEXT_SUSPENDED', () => {
      const error = new AppError(ErrorCode.AUDIO_CONTEXT_SUSPENDED, 'Suspended')
      expect(error.getUserMessage()).toBe('点击页面任意处开始播放')
    })

    it('should return friendly message for MAIN_PROCESS_CRASH', () => {
      const error = new AppError(ErrorCode.MAIN_PROCESS_CRASH, 'Crashed')
      expect(error.getUserMessage()).toBe('主进程异常')
    })

    it('should return friendly message for STORAGE_FULL', () => {
      const error = new AppError(ErrorCode.STORAGE_FULL, 'Storage full')
      expect(error.getUserMessage()).toBe('存储空间已满')
    })

    it('should return friendly message for UNKNOWN_ERROR', () => {
      const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Unknown')
      expect(error.getUserMessage()).toBe('未知错误')
    })

    it('should return original message for unmapped error code', () => {
      // 使用一个未映射的错误码
      const error = new AppError(9998 as any, 'Custom error message')
      expect(error.getUserMessage()).toBe('Custom error message')
    })

    it('should return default message when no message provided', () => {
      const error = new AppError(9998 as any, '')
      expect(error.getUserMessage()).toBe('操作失败，请重试')
    })
  })

  describe('Errors factory', () => {
    describe('Errors.noCopyright()', () => {
      it('should create SONG_NO_COPYRIGHT error with songId', () => {
        const error = Errors.noCopyright('song123')

        expect(error.code).toBe(ErrorCode.SONG_NO_COPYRIGHT)
        expect(error.message).toBe('No copyright')
        expect(error.recoverable).toBe(true)
        expect(error.data).toEqual({ songId: 'song123' })
      })

      it('should accept numeric songId', () => {
        const error = Errors.noCopyright(12345)
        expect(error.data).toEqual({ songId: 12345 })
      })
    })

    describe('Errors.network()', () => {
      it('should create NETWORK_OFFLINE error', () => {
        const error = Errors.network()

        expect(error.code).toBe(ErrorCode.NETWORK_OFFLINE)
        expect(error.message).toBe('Network error')
        expect(error.recoverable).toBe(true)
      })
    })

    describe('Errors.fatal()', () => {
      it('should create non-recoverable MAIN_PROCESS_CRASH error', () => {
        const error = Errors.fatal('Critical system failure')

        expect(error.code).toBe(ErrorCode.MAIN_PROCESS_CRASH)
        expect(error.message).toBe('Critical system failure')
        expect(error.recoverable).toBe(false)
      })
    })

    describe('Errors.unknown()', () => {
      it('should create UNKNOWN_ERROR with message', () => {
        const error = Errors.unknown('Something went wrong')

        expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR)
        expect(error.message).toBe('Something went wrong')
        expect(error.recoverable).toBe(true)
      })

      it('should create UNKNOWN_ERROR with data', () => {
        const error = Errors.unknown('Error', { detail: 'info' })

        expect(error.data).toEqual({ detail: 'info' })
      })
    })
  })
})
