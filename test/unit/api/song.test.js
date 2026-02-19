import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request module
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn()
}))

// Import after mocking
import request from '../../../src/utils/request'
import { getNewestSong, checkMusic, getMusicUrl, likeMusic, getLyric, getSongDetail } from '../../../src/api/song'

describe('Song API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getNewestSong', () => {
    it('should fetch newest songs with default limit', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: [{ id: 1, name: 'Test Song' }] }
      })

      await getNewestSong()

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 10 }
      })
    })

    it('should fetch newest songs with custom limit', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: [] }
      })

      await getNewestSong(20)

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 20 }
      })
    })

    it('should handle limit of 0', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, result: [] }
      })

      await getNewestSong(0)

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 0 }
      })
    })
  })

  describe('checkMusic', () => {
    it('should check if music is available with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, success: true, message: 'ok' }
      })

      await checkMusic(123)

      expect(request).toHaveBeenCalledWith({
        url: '/check/music',
        method: 'get',
        params: { id: 123 }
      })
    })

    it('should handle invalid song id', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, success: false }
      })

      await checkMusic(null)

      expect(request).toHaveBeenCalledWith({
        url: '/check/music',
        method: 'get',
        params: { id: null }
      })
    })
  })

  describe('getMusicUrl', () => {
    it('should get music URL with default level', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, data: [{ id: 123, url: 'https://example.com/song.mp3' }] }
      })

      await getMusicUrl(123)

      expect(request).toHaveBeenCalledWith({
        url: '/song/url/v1',
        method: 'get',
        params: { id: 123, level: 'standard' }
      })
    })

    it('should get music URL with custom level', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, data: [] }
      })

      await getMusicUrl(123, 'lossless')

      expect(request).toHaveBeenCalledWith({
        url: '/song/url/v1',
        method: 'get',
        params: { id: 123, level: 'lossless' }
      })
    })

    it('should handle different quality levels', async () => {
      const levels = ['standard', 'higher', 'exhigh', 'lossless', 'hires']

      for (const level of levels) {
        request.mockResolvedValueOnce({
          data: { code: 200, data: [] }
        })

        await getMusicUrl(123, level)

        expect(request).toHaveBeenLastCalledWith({
          url: '/song/url/v1',
          method: 'get',
          params: { id: 123, level }
        })
      }
    })
  })

  describe('likeMusic', () => {
    it('should like a song with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200 }
      })

      await likeMusic(123, true)

      expect(request).toHaveBeenCalledWith({
        url: '/like',
        method: 'get',
        params: expect.objectContaining({
          id: 123,
          like: true
        })
      })
    })

    it('should unlike a song with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200 }
      })

      await likeMusic(123, false)

      expect(request).toHaveBeenCalledWith({
        url: '/like',
        method: 'get',
        params: expect.objectContaining({
          id: 123,
          like: false
        })
      })
    })

    it('should use default like value (true)', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200 }
      })

      await likeMusic(123)

      expect(request).toHaveBeenCalledWith({
        url: '/like',
        method: 'get',
        params: expect.objectContaining({
          id: 123,
          like: true
        })
      })
    })

    it('should include timestamp in request', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200 }
      })

      const beforeTime = Date.now()
      await likeMusic(123, true)
      const afterTime = Date.now()

      const callArgs = request.mock.calls[0][0]
      expect(callArgs.params.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(callArgs.params.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('getLyric', () => {
    it('should get lyric with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, lrc: { lyric: '[00:00.000] Test lyric' } }
      })

      await getLyric(123)

      expect(request).toHaveBeenCalledWith({
        url: '/lyric',
        method: 'get',
        params: { id: 123 }
      })
    })

    it('should handle pure music (no lyrics)', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, lrc: { lyric: '' }, pureMusic: true }
      })

      const result = await getLyric(456)

      expect(request).toHaveBeenCalledWith({
        url: '/lyric',
        method: 'get',
        params: { id: 456 }
      })
      expect(result.data.pureMusic).toBe(true)
    })
  })

  describe('getSongDetail', () => {
    it('should get details for a single song with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, songs: [{ id: 123, name: 'Test Song' }] }
      })

      await getSongDetail('123')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '123' }
      })
    })

    it('should get details for multiple songs with correct params', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, songs: [] }
      })

      await getSongDetail('123,456,789')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '123,456,789' }
      })
    })

    it('should handle empty ids string', async () => {
      request.mockResolvedValueOnce({
        data: { code: 200, songs: [] }
      })

      await getSongDetail('')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '' }
      })
    })
  })
})
