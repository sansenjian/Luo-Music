import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request module with parameter-based responses
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn((config) => {
    const { url, params } = config

    // getMusicUrl - VIP/copyright restricted songs (id: 999999)
    if (url === '/song/url/v1' && params?.id === 999999) {
      return Promise.resolve({
        data: {
          code: 200,
          data: [{ id: 999999, url: null, freeTrialInfo: null }]
        }
      })
    }

    // getMusicUrl - normal songs
    if (url === '/song/url/v1') {
      return Promise.resolve({
        data: {
          code: 200,
          data: [{ id: params?.id, url: 'https://example.com/song.mp3', level: params?.level }]
        }
      })
    }

    // getLyric - pure music (id: 456)
    if (url === '/lyric' && params?.id === 456) {
      return Promise.resolve({
        data: {
          code: 200,
          lrc: { lyric: '' },
          tlyric: { lyric: '' },
          romalrc: { lyric: '' },
          pureMusic: true
        }
      })
    }

    // getLyric - normal songs
    if (url === '/lyric') {
      return Promise.resolve({
        data: {
          code: 200,
          lrc: { lyric: '[00:00.000] Test lyric' },
          tlyric: { lyric: '[00:00.000] Test translation' },
          romalrc: { lyric: '[00:00.000] Test romaji' }
        }
      })
    }

    // checkMusic
    if (url === '/check/music') {
      const isAvailable = params?.id !== null && params?.id !== undefined
      return Promise.resolve({
        data: {
          code: 200,
          success: isAvailable,
          message: isAvailable ? 'ok' : 'Song not available'
        }
      })
    }

    // getNewestSong
    if (url === '/personalized/newsong') {
      const limit = params?.limit || 10
      return Promise.resolve({
        data: {
          code: 200,
          result: Array(limit).fill(null).map((_, i) => ({
            id: i + 1,
            name: `Test Song ${i + 1}`
          }))
        }
      })
    }

    // likeMusic
    if (url === '/like') {
      return Promise.resolve({
        data: { code: 200, msg: 'Success' }
      })
    }

    // getSongDetail
    if (url === '/song/detail') {
      const ids = params?.ids?.split(',') || []
      return Promise.resolve({
        data: {
          code: 200,
          songs: ids.map((id, i) => ({
            id: parseInt(id) || i,
            name: `Test Song ${id || i}`
          }))
        }
      })
    }

    // Default fallback
    return Promise.resolve({ data: { code: 200 } })
  })
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
      const result = await getNewestSong()

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 10 }
      })
      expect(result.data.result).toHaveLength(10)
    })

    it('should fetch newest songs with custom limit', async () => {
      const result = await getNewestSong(20)

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 20 }
      })
      expect(result.data.result).toHaveLength(20)
    })

    it('should handle limit of 0', async () => {
      const result = await getNewestSong(0)

      expect(request).toHaveBeenCalledWith({
        url: '/personalized/newsong',
        method: 'get',
        params: { limit: 0 }
      })
    })
  })

  describe('checkMusic', () => {
    it('should check if music is available with correct params', async () => {
      const result = await checkMusic(123)

      expect(request).toHaveBeenCalledWith({
        url: '/check/music',
        method: 'get',
        params: { id: 123 }
      })
      expect(result.data.success).toBe(true)
    })

    it('should handle unavailable song (null id)', async () => {
      const result = await checkMusic(null)

      expect(request).toHaveBeenCalledWith({
        url: '/check/music',
        method:        'get',
        params: { id: null }
      })
      expect(result.data.success).toBe(false)
    })
  })

  describe('getMusicUrl', () => {
    it('should get music URL with default level', async () => {
      const result = await getMusicUrl(123)

      expect(request).toHaveBeenCalledWith({
        url: '/song/url/v1',
        method: 'get',
        params: { id: 123, level: 'standard' }
      })
      expect(result.data.data[0].url).toBe('https://example.com/song.mp3')
    })

    it('should get music URL with custom level', async () => {
      const result = await getMusicUrl(123, 'lossless')

      expect(request).toHaveBeenCalledWith({
        url: '/song/url/v1',
        method: 'get',
        params: { id: 123, level: 'lossless' }
      })
    })

    it('should handle VIP/copyright restricted songs', async () => {
      const result = await getMusicUrl(999999)

      expect(request).toHaveBeenCalledWith({
        url: '/song/url/v1',
        method: 'get',
        params: { id: 999999, level: 'standard' }
      })
      // VIP songs return null URL
      expect(result.data.data[0].url).toBeNull()
    })

    it('should handle different quality levels', async () => {
      const levels = ['standard', 'higher', 'exhigh', 'lossless', 'hires']

      for (const level of levels) {
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
      const result = await getLyric(123)

      expect(request).toHaveBeenCalledWith({
        url: '/lyric',
        method: 'get',
        params: { id: 123 }
      })
      expect(result.data.lrc.lyric).toBe('[00:00.000] Test lyric')
    })

    it('should handle pure music (no lyrics)', async () => {
      const result = await getLyric(456)

      expect(request).toHaveBeenCalledWith({
        url: '/lyric',
        method: 'get',
        params: { id: 456 }
      })
      expect(result.data.pureMusic).toBe(true)
      expect(result.data.lrc.lyric).toBe('')
    })
  })

  describe('getSongDetail', () => {
    it('should get details for a single song with correct params', async () => {
      const result = await getSongDetail('123')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '123' }
      })
      expect(result.data.songs).toHaveLength(1)
      expect(result.data.songs[0].id).toBe(123)
    })

    it('should get details for multiple songs with correct params', async () => {
      const result = await getSongDetail('123,456,789')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '123,456,789' }
      })
      expect(result.data.songs).toHaveLength(3)
    })

    it('should handle empty ids string', async () => {
      const result = await getSongDetail('')

      expect(request).toHaveBeenCalledWith({
        url: '/song/detail',
        method: 'get',
        params: { ids: '' }
      })
      expect(result.data.songs).toHaveLength(1)
    })
  })
})
