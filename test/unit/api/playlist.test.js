import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecommendPlaylist, getPlaylistDetail, getPlaylistTracks, getRecommendSongs } from '../../../src/api/playlist'

// Mock request module
vi.mock('../../../src/utils/request', () => ({
  default: vi.fn((config) => Promise.resolve({ 
    data: { 
      code: 200, 
      ...mockResponseData[config.url]
    } 
  }))
}))

const mockResponseData = {
  '/personalized': {
    result: [
      { id: 1, name: '推荐歌单1', playCount: 1000 },
      { id: 2, name: '推荐歌单2', playCount: 2000 }
    ]
  },
  '/playlist/detail': {
    playlist: {
      id: 123,
      name: 'Test Playlist',
      description: 'Test Description',
      tracks: [
        { id: 1, name: 'Song 1' },
        { id: 2, name: 'Song 2' }
      ]
    }
  },
  '/playlist/track/all': {
    songs: [
      { id: 1, name: 'Track 1', artists: [{ name: 'Artist 1' }] },
      { id: 2, name: 'Track 2', artists: [{ name: 'Artist 2' }] }
    ]
  },
  '/recommend/songs': {
    data: {
      dailySongs: [
        { id: 1, name: 'Daily Song 1' },
        { id: 2, name: 'Daily Song 2' }
      ]
    }
  }
}

describe('Playlist API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRecommendPlaylist', () => {
    it('should get recommend playlists with default limit', async () => {
      const result = await getRecommendPlaylist()
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('result')
      expect(Array.isArray(result.data.result)).toBe(true)
    })

    it('should get recommend playlists with custom limit', async () => {
      const result = await getRecommendPlaylist(20)
      expect(result).toHaveProperty('data')
    })

    it('should handle limit of 0', async () => {
      const result = await getRecommendPlaylist(0)
      expect(result).toHaveProperty('data')
    })

    it('should handle large limit', async () => {
      const result = await getRecommendPlaylist(100)
      expect(result).toHaveProperty('data')
    })
  })

  describe('getPlaylistDetail', () => {
    it('should get playlist detail', async () => {
      const result = await getPlaylistDetail(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('playlist')
    })

    it('should handle invalid playlist id', async () => {
      const result = await getPlaylistDetail(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle undefined playlist id', async () => {
      const result = await getPlaylistDetail(undefined)
      expect(result).toHaveProperty('data')
    })

    it('should handle string playlist id', async () => {
      const result = await getPlaylistDetail('123')
      expect(result).toHaveProperty('data')
    })

    it('should handle zero playlist id', async () => {
      const result = await getPlaylistDetail(0)
      expect(result).toHaveProperty('data')
    })

    it('should handle negative playlist id', async () => {
      const result = await getPlaylistDetail(-1)
      expect(result).toHaveProperty('data')
    })
  })

  describe('getPlaylistTracks', () => {
    it('should get playlist tracks with default parameters', async () => {
      const result = await getPlaylistTracks(123)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('songs')
      expect(Array.isArray(result.data.songs)).toBe(true)
    })

    it('should get playlist tracks with custom limit', async () => {
      const result = await getPlaylistTracks(123, 50)
      expect(result).toHaveProperty('data')
    })

    it('should get playlist tracks with offset', async () => {
      const result = await getPlaylistTracks(123, 100, 100)
      expect(result).toHaveProperty('data')
    })

    it('should handle pagination', async () => {
      const result1 = await getPlaylistTracks(123, 10, 0)
      const result2 = await getPlaylistTracks(123, 10, 10)
      expect(result1).toHaveProperty('data')
      expect(result2).toHaveProperty('data')
    })

    it('should handle invalid playlist id', async () => {
      const result = await getPlaylistTracks(null)
      expect(result).toHaveProperty('data')
    })

    it('should handle limit of 0', async () => {
      const result = await getPlaylistTracks(123, 0)
      expect(result).toHaveProperty('data')
    })

    it('should handle large offset', async () => {
      const result = await getPlaylistTracks(123, 100, 10000)
      expect(result).toHaveProperty('data')
    })
  })

  describe('getRecommendSongs', () => {
    it('should get daily recommend songs', async () => {
      const result = await getRecommendSongs()
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('data')
      expect(result.data.data).toHaveProperty('dailySongs')
    })

    it('should return array of songs', async () => {
      const result = await getRecommendSongs()
      expect(result).toHaveProperty('data')
      if (result.data.data && result.data.data.dailySongs) {
        expect(Array.isArray(result.data.data.dailySongs)).toBe(true)
      }
    })
  })
})
