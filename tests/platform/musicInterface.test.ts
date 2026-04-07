import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSong, type Song } from '@/platform/music/interface'
import type { Artist } from '@/platform/music/interface'

describe('platform/music/interface', () => {
  describe('createSong()', () => {
    it('should create song with minimal required fields', () => {
      const song = createSong({
        id: '123',
        name: 'Test Song',
        platform: 'netease'
      })

      expect(song.id).toBe('123')
      expect(song.name).toBe('Test Song')
      expect(song.platform).toBe('netease')
      expect(song.artists).toEqual([])
      expect(song.album).toEqual({ id: 0, name: '', picUrl: '' })
      expect(song.duration).toBe(0)
      expect(song.mvid).toBe(0)
      expect(song.originalId).toBe('123')
    })

    it('should create song with all fields', () => {
      const song = createSong({
        id: 456,
        name: 'Full Song',
        artists: [{ id: 1, name: 'Artist Name' }],
        album: { id: 2, name: 'Album Name', picUrl: 'https://example.com/cover.jpg' },
        duration: 180000,
        mvid: 789,
        platform: 'qq',
        originalId: 'mid123'
      })

      expect(song.id).toBe(456)
      expect(song.name).toBe('Full Song')
      expect(song.artists).toHaveLength(1)
      expect(song.artists[0]).toEqual({ id: 1, name: 'Artist Name' })
      expect(song.album).toEqual({
        id: 2,
        name: 'Album Name',
        picUrl: 'https://example.com/cover.jpg'
      })
      expect(song.duration).toBe(180000)
      expect(song.mvid).toBe(789)
      expect(song.platform).toBe('qq')
      expect(song.originalId).toBe('mid123')
    })

    it('should use id as originalId if not specified', () => {
      const song = createSong({
        id: 'test-id',
        name: 'Song',
        platform: 'netease'
      })

      expect(song.originalId).toBe('test-id')
    })

    it('should preserve extra data', () => {
      const song = createSong({
        id: 1,
        name: 'Song',
        platform: 'netease',
        extra: {
          source: 'playlist',
          addedAt: '2024-01-01'
        }
      })

      expect(song.extra).toEqual({
        source: 'playlist',
        addedAt: '2024-01-01'
      })
    })

    it('should not include extra field if not provided', () => {
      const song = createSong({
        id: 1,
        name: 'Song',
        platform: 'netease'
      })

      expect(song.extra).toBeUndefined()
    })

    it('should support numeric id', () => {
      const song = createSong({
        id: 12345,
        name: 'Numeric ID Song',
        platform: 'qq'
      })

      expect(song.id).toBe(12345)
      expect(typeof song.id).toBe('number')
    })

    it('should support string id', () => {
      const song = createSong({
        id: 'string-id-123',
        name: 'String ID Song',
        platform: 'netease'
      })

      expect(song.id).toBe('string-id-123')
      expect(typeof song.id).toBe('string')
    })

    it('should handle multiple artists', () => {
      const song = createSong({
        id: 1,
        name: 'Collaboration Song',
        platform: 'netease',
        artists: [
          { id: 1, name: 'Artist 1' },
          { id: 2, name: 'Artist 2' },
          { id: 3, name: 'Artist 3' }
        ]
      })

      expect(song.artists).toHaveLength(3)
      expect(song.artists.map((artist: Artist) => artist.name)).toEqual([
        'Artist 1',
        'Artist 2',
        'Artist 3'
      ])
    })

    it('should support both netease and qq platforms', () => {
      const neteaseSong = createSong({
        id: 1,
        name: 'Netease Song',
        platform: 'netease'
      })

      const qqSong = createSong({
        id: 2,
        name: 'QQ Song',
        platform: 'qq'
      })

      expect(neteaseSong.platform).toBe('netease')
      expect(qqSong.platform).toBe('qq')
    })
  })
})
