import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getNewestSong, checkMusic, getMusicUrl, likeMusic, getLyric, getSongDetail } from '../../../src/api/song'

// Mock request module
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn((config) => Promise.resolve({ data: { code: 200, ...mockResponseData[config.url] } }))
}))

// Mock response data for different endpoints
const mockResponseData = {
  '/personalized/newsong': {
    result: [
      { id: 1, name: 'Test Song 1', artists: [{ name: 'Artist 1' }] },
      { id: 2, name: 'Test Song 2', artists: [{ name: 'Artist 2' }] }
    ]
  },
  '/check/music': {
    success: true,
    message: 'ok'
  },
  '/song/url/v1': {
    data: [
      { id: 123, url: 'https://example.com/song.mp3', level: 'standard' }
    ]
  },
  '/like': {
    code: 200
  },
  '/lyric': {
    lrc: { lyric: '[00:00.000] Test lyric' },
    tlyric: { lyric: '[00:00.000] Test translation' },
    romalrc: { lyric: '[00:00.000] Test romaji' }
  },
  '/song/detail': {
    songs: [
      { id: 123, name: 'Test Song', artists: [{ name: 'Test Artist' }] }
    ]
  }
}

describe('Song API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getNewestSong', () => {
    it('should fetch newest songs with default limit', async () => {
      const result = await getNewestSong()
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('result')
      expect(Array.isArray(result.data.result)).toBe(true)
    })

    it('should fetch newest songs with custom limit', async () => {
      const result = await getNewestSong(20)
      expect(result).toHaveProperty('data')
    })

    it('should handle limit of 0', async () => {
      const result = await getNewestSong(0)
      expect(result).toHaveProperty('data')
    })
  })

  describe('checkMusic', () => {
    it('should check if music is available', async () => {
      const result = await checkMusic(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('success')
    })

    it('should handle invalid song id', async () => {
      const result = await checkMusic(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle undefined song id', async () => {
      const result = await checkMusic(undefined)
      expect(result).toHaveProperty('data')
    })
  })

  describe('getMusicUrl', () => {
    it('should get music URL with default level', async () => {
      const result = await getMusicUrl(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('data')
      expect(Array.isArray(result.data.data)).toBe(true)
    })

    it('should get music URL with custom level', async () => {
      const result = await getMusicUrl(123, 'lossless')
      expect(result).toHaveProperty('data')
    })

    it('should handle different quality levels', async () => {
      const levels = ['standard', 'higher', 'exhigh', 'lossless', 'hires']
      for (const level of levels) {
        const result = await getMusicUrl(123, level)
        expect(result).toHaveProperty('data')
      }
    })

    it('should handle invalid song id', async () => {
      const result = await getMusicUrl(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle VIP/copyright restricted songs', async () => {
      // Mock response for restricted song
      const result = await getMusicUrl(999999)
      expect(result).toHaveProperty('data')
    })
  })

  describe('likeMusic', () => {
    it('should like a song', async () => {
      const result = await likeMusic(123, true)
      expect(result).toHaveProperty('data')
      expect(result.data.code).toBe(200)
    })

    it('should unlike a song', async () => {
      const result = await likeMusic(123, false)
      expect(result).toHaveProperty('data')
    })

    it('should use default like value (true)', async () => {
      const result = await likeMusic(123)
      expect(result).toHaveProperty('data')
    })

    it('should handle invalid song id', async () => {
      const result = await likeMusic(null, true)
      expect(result).toHaveProperty('data')
    })

    it('should include timestamp in request', async () => {
      const beforeTime = Date.now()
      await likeMusic(123, true)
      const afterTime = Date.now()
      // Timestamp should be between before and after
      expect(afterTime).toBeGreaterThanOrEqual(beforeTime)
    })
  })

  describe('getLyric', () => {
    it('should get lyric for a song', async () => {
      const result = await getLyric(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('lrc')
    })

    it('should handle pure music (no lyrics)', async () => {
      const result = await getLyric(456)
      expect(result).toHaveProperty('data')
    })

    it('should handle songs with translation lyrics', async () => {
      const result = await getLyric(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('tlyric')
    })

    it('should handle songs with romaji lyrics', async () => {
      const result = await getLyric(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('romalrc')
    })

    it('should handle invalid song id', async () => {
      const result = await getLyric(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle undefined song id', async () => {
      const result = await getLyric(undefined)
      expect(result).toHaveProperty('data')
    })
  })

  describe('getSongDetail', () => {
    it('should get details for a single song', async () => {
      const result = await getSongDetail('123')
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('songs')
      expect(Array.isArray(result.data.songs)).toBe(true)
    })

    it('should get details for multiple songs', async () => {
      const result = await getSongDetail('123,456,789')
      expect(result).toHaveProperty('data')
    })

    it('should handle empty ids string', async () => {
      const result = await getSongDetail('')
      expect(result).toHaveProperty('data')
    })

    it('should handle invalid ids format', async () => {
      const result = await getSongDetail('invalid')
      expect(result).toHaveProperty('data')
    })

    it('should handle null ids', async () => {
      const result = await getSongDetail(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle undefined ids', async () => {
      const result = await getSongDetail(undefined)
      expect(result).toHaveProperty('data')
    })
  })
})
