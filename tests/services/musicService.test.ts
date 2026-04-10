import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMusicService } from '@/services/musicService'
import type { Song, LyricResult, PlaylistDetail, SearchResult } from '@/types/schemas'
import type { MusicPlatformAdapter } from '@/platform/music/interface'

// Mock getMusicAdapter
const mockAdapter = {
  platformId: 'mock',
  search: vi.fn(),
  getSongUrl: vi.fn(),
  getSongDetail: vi.fn(),
  getLyric: vi.fn(),
  getPlaylistDetail: vi.fn()
}

vi.mock('@/platform/music', () => ({
  getMusicAdapter: vi.fn(() => mockAdapter)
}))

describe('musicService', () => {
  let musicService: ReturnType<typeof createMusicService>

  beforeEach(() => {
    vi.clearAllMocks()
    musicService = createMusicService()
  })

  describe('search', () => {
    it('should call adapter search with correct parameters', async () => {
      const mockResult: SearchResult = {
        list: [
          {
            id: '1',
            name: 'Test Song',
            artists: [{ id: '1', name: 'Artist' }],
            album: { id: '1', name: 'Album', picUrl: '' },
            duration: 180000,
            mvid: 0,
            platform: 'netease',
            originalId: '1'
          }
        ],
        total: 1
      }
      mockAdapter.search.mockResolvedValue(mockResult)

      const result = await musicService.search('netease', '周杰伦', 30, 1)

      expect(mockAdapter.search).toHaveBeenCalledWith('周杰伦', 30, 1)
      expect(result).toBe(mockResult)
    })

    it('should handle empty search results', async () => {
      const mockResult: SearchResult = { list: [], total: 0 }
      mockAdapter.search.mockResolvedValue(mockResult)

      const result = await musicService.search('qq', 'unknown', 30, 1)

      expect(result.list).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should propagate errors from adapter', async () => {
      const error = new Error('Network error')
      mockAdapter.search.mockRejectedValue(error)

      await expect(musicService.search('netease', 'test', 30, 1)).rejects.toThrow('Network error')
    })

    it('should use default platform when not specified', async () => {
      mockAdapter.search.mockResolvedValue({ list: [], total: 0 })

      await musicService.search('netease', 'test', 30, 1)

      expect(mockAdapter.search).toHaveBeenCalledWith('test', 30, 1)
    })
  })

  describe('getSongUrl', () => {
    it('should call adapter getSongUrl with id', async () => {
      mockAdapter.getSongUrl.mockResolvedValue('https://example.com/song.mp3')

      const result = await musicService.getSongUrl('netease', '123')

      expect(mockAdapter.getSongUrl).toHaveBeenCalledWith('123', undefined)
      expect(result).toBe('https://example.com/song.mp3')
    })

    it('should pass options to adapter', async () => {
      mockAdapter.getSongUrl.mockResolvedValue('https://example.com/song.mp3')

      const options = { level: 'lossless' as const, br: 320 }
      await musicService.getSongUrl('qq', '456', options)

      expect(mockAdapter.getSongUrl).toHaveBeenCalledWith('456', options)
    })

    it('should handle string options for backwards compatibility', async () => {
      mockAdapter.getSongUrl.mockResolvedValue('https://example.com/song.mp3')

      await musicService.getSongUrl('netease', '789', 'standard')

      expect(mockAdapter.getSongUrl).toHaveBeenCalledWith('789', 'standard')
    })

    it('should return null when adapter returns null', async () => {
      mockAdapter.getSongUrl.mockResolvedValue(null)

      const result = await musicService.getSongUrl('netease', 'invalid')

      expect(result).toBeNull()
    })

    it('should handle numeric song IDs', async () => {
      mockAdapter.getSongUrl.mockResolvedValue('https://example.com/song.mp3')

      await musicService.getSongUrl('netease', 12345)

      expect(mockAdapter.getSongUrl).toHaveBeenCalledWith(12345, undefined)
    })
  })

  describe('getSongDetail', () => {
    it('should call adapter getSongDetail with id', async () => {
      const mockSong: Song = {
        id: '1',
        name: 'Test Song',
        artists: [{ id: '1', name: 'Artist' }],
        album: { id: '1', name: 'Album', picUrl: 'http://example.com/cover.jpg' },
        duration: 180000,
        mvid: 0,
        platform: 'netease',
        originalId: '1'
      }
      mockAdapter.getSongDetail.mockResolvedValue(mockSong)

      const result = await musicService.getSongDetail('netease', '1')

      expect(mockAdapter.getSongDetail).toHaveBeenCalledWith('1')
      expect(result).toBe(mockSong)
    })

    it('should return null when song not found', async () => {
      mockAdapter.getSongDetail.mockResolvedValue(null)

      const result = await musicService.getSongDetail('netease', 'nonexistent')

      expect(result).toBeNull()
    })

    it('should handle numeric IDs', async () => {
      const mockSong: Song = {
        id: 123,
        name: 'Test Song',
        artists: [],
        album: { id: 1, name: 'Album', picUrl: '' },
        duration: 0,
        mvid: 0,
        platform: 'qq',
        originalId: 123
      }
      mockAdapter.getSongDetail.mockResolvedValue(mockSong)

      await musicService.getSongDetail('qq', 123)

      expect(mockAdapter.getSongDetail).toHaveBeenCalledWith(123)
    })
  })

  describe('getLyric', () => {
    it('should call adapter getLyric with id', async () => {
      const mockLyric: LyricResult = {
        lrc: '[00:00.00]Test',
        tlyric: '',
        romalrc: ''
      }
      mockAdapter.getLyric.mockResolvedValue(mockLyric)

      const result = await musicService.getLyric('netease', '1')

      expect(mockAdapter.getLyric).toHaveBeenCalledWith('1')
      expect(result).toBe(mockLyric)
    })

    it('should return empty lyrics when not found', async () => {
      const mockLyric: LyricResult = { lrc: '', tlyric: '', romalrc: '' }
      mockAdapter.getLyric.mockResolvedValue(mockLyric)

      const result = await musicService.getLyric('netease', 'no-lyric')

      expect(result.lrc).toBe('')
    })

    it('should handle QQ music lyrics', async () => {
      const mockLyric: LyricResult = {
        lrc: '[00:00.00]QQ Lyric',
        tlyric: '[00:00.00]Translation',
        romalrc: '[00:00.00]Roma'
      }
      mockAdapter.getLyric.mockResolvedValue(mockLyric)

      const result = await musicService.getLyric('qq', 'qq-123')

      expect(mockAdapter.getLyric).toHaveBeenCalledWith('qq-123')
      expect(result).toBe(mockLyric)
    })
  })

  describe('getPlaylistDetail', () => {
    it('should call adapter getPlaylistDetail with id', async () => {
      const mockPlaylist: PlaylistDetail = {
        id: '1',
        name: 'Test Playlist',
        coverImgUrl: 'http://example.com/cover.jpg',
        description: 'A test playlist',
        trackCount: 10,
        tracks: [
          {
            id: '1',
            name: 'Song 1',
            artists: [],
            album: { id: 1, name: 'Album', picUrl: '' },
            duration: 180000,
            mvid: 0,
            platform: 'netease',
            originalId: '1'
          }
        ]
      }
      mockAdapter.getPlaylistDetail.mockResolvedValue(mockPlaylist)

      const result = await musicService.getPlaylistDetail('netease', '1')

      expect(mockAdapter.getPlaylistDetail).toHaveBeenCalledWith('1')
      expect(result).toBe(mockPlaylist)
    })

    it('should return null when playlist not found', async () => {
      mockAdapter.getPlaylistDetail.mockResolvedValue(null)

      const result = await musicService.getPlaylistDetail('netease', 'nonexistent')

      expect(result).toBeNull()
    })

    it('should handle empty playlist', async () => {
      const mockPlaylist: PlaylistDetail = {
        id: 'empty',
        name: 'Empty Playlist',
        coverImgUrl: '',
        tracks: []
      }
      mockAdapter.getPlaylistDetail.mockResolvedValue(mockPlaylist)

      const result = await musicService.getPlaylistDetail('netease', 'empty')

      expect(result?.tracks).toEqual([])
    })
  })

  describe('cross-platform support', () => {
    it('should work with netease platform', async () => {
      mockAdapter.search.mockResolvedValue({ list: [], total: 0 })

      await musicService.search('netease', 'test', 30, 1)

      expect(mockAdapter.search).toHaveBeenCalled()
    })

    it('should work with qq platform', async () => {
      mockAdapter.search.mockResolvedValue({ list: [], total: 0 })

      await musicService.search('qq', 'test', 30, 1)

      expect(mockAdapter.search).toHaveBeenCalled()
    })

    it('supports an injected adapter resolver', async () => {
      const resolveAdapter = vi.fn(
        (_platform: string): MusicPlatformAdapter => mockAdapter as unknown as MusicPlatformAdapter
      )
      mockAdapter.getLyric.mockResolvedValue({ lrc: '', tlyric: '', romalrc: '' })
      const injectedService = createMusicService({ resolveAdapter })

      await injectedService.getLyric('netease', 'song-1')

      expect(resolveAdapter).toHaveBeenCalledWith('netease')
      expect(mockAdapter.getLyric).toHaveBeenCalledWith('song-1')
    })
  })
})
