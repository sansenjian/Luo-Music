import { describe, it, expect, beforeEach } from 'vitest'
import { PlaylistManager, type Playlist } from '../../src/utils/player/core/playlistManager'
import { PLAY_MODE } from '../../src/utils/player/constants'
import type { Song } from '../../src/platform/music/interface'

// 创建测试用的歌曲数据
const createTestSong = (id: number, name: string): Song => ({
  id,
  name,
  artists: [{ id: 1, name: 'Test Artist' }],
  album: { id: 1, name: 'Test Album', picUrl: '' },
  duration: 180000,
  mvid: 0,
  platform: 'netease',
  originalId: id
})

describe('player/core/playlistManager', () => {
  let manager: PlaylistManager
  let playlist: Playlist

  beforeEach(() => {
    manager = new PlaylistManager()
    playlist = manager.createPlaylist()
  })

  describe('createPlaylist()', () => {
    it('should create empty playlist', () => {
      expect(playlist.list).toEqual([])
      expect(playlist.currentIndex).toBe(-1)
      expect(playlist.playMode).toBe(PLAY_MODE.SEQUENTIAL)
    })

    it('should create playlist with initial songs', () => {
      const songs = [createTestSong(1, 'Song 1'), createTestSong(2, 'Song 2')]
      const pl = manager.createPlaylist(songs)

      expect(pl.list).toHaveLength(2)
      expect(pl.list).toEqual(songs)
    })
  })

  describe('setPlaylist()', () => {
    it('should replace playlist content', () => {
      const songs = [createTestSong(1, 'Song 1'), createTestSong(2, 'Song 2')]
      manager.setPlaylist(playlist, songs)

      expect(playlist.list).toEqual(songs)
      expect(playlist.currentIndex).toBe(-1)
    })

    it('should reset currentIndex to -1', () => {
      playlist.currentIndex = 5
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1')])

      expect(playlist.currentIndex).toBe(-1)
    })
  })

  describe('addToPlaylist()', () => {
    it('should add song to end of playlist', () => {
      const song1 = createTestSong(1, 'Song 1')
      const song2 = createTestSong(2, 'Song 2')

      manager.addToPlaylist(playlist, song1)
      manager.addToPlaylist(playlist, song2)

      expect(playlist.list).toHaveLength(2)
      expect(playlist.list[1]).toEqual(song2)
    })
  })

  describe('removeFromPlaylist()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [
        createTestSong(1, 'Song 1'),
        createTestSong(2, 'Song 2'),
        createTestSong(3, 'Song 3')
      ])
    })

    it('should remove song at index', () => {
      const removed = manager.removeFromPlaylist(playlist, 1)

      expect(removed).toEqual(createTestSong(2, 'Song 2'))
      expect(playlist.list).toHaveLength(2)
      expect(playlist.list.map(s => s.id)).toEqual([1, 3])
    })

    it('should return null for invalid index', () => {
      expect(manager.removeFromPlaylist(playlist, -1)).toBeNull()
      expect(manager.removeFromPlaylist(playlist, 100)).toBeNull()
    })

    it('should adjust currentIndex when removing before current', () => {
      playlist.currentIndex = 2
      manager.removeFromPlaylist(playlist, 0)

      expect(playlist.currentIndex).toBe(1)
    })

    it('should not adjust currentIndex when removing after current', () => {
      playlist.currentIndex = 0
      manager.removeFromPlaylist(playlist, 2)

      expect(playlist.currentIndex).toBe(0)
    })

    it('should adjust currentIndex when removing current song', () => {
      playlist.currentIndex = 1
      manager.removeFromPlaylist(playlist, 1)

      // currentIndex 保持不变，但现在指向下一首歌
      expect(playlist.currentIndex).toBe(1)
      expect(playlist.list[1].id).toBe(3)
    })

    it('should handle currentIndex at end', () => {
      playlist.currentIndex = 2
      manager.removeFromPlaylist(playlist, 2)

      expect(playlist.currentIndex).toBe(1) // 移动到最后一首
    })
  })

  describe('clearPlaylist()', () => {
    it('should clear all songs and reset state', () => {
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1')])
      playlist.currentIndex = 0

      manager.clearPlaylist(playlist)

      expect(playlist.list).toEqual([])
      expect(playlist.currentIndex).toBe(-1)
    })
  })

  describe('getCurrentSong()', () => {
    it('should return null for empty playlist', () => {
      expect(manager.getCurrentSong(playlist)).toBeNull()
    })

    it('should return null when currentIndex is -1', () => {
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1')])
      expect(manager.getCurrentSong(playlist)).toBeNull()
    })

    it('should return current song', () => {
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1'), createTestSong(2, 'Song 2')])
      playlist.currentIndex = 1

      const current = manager.getCurrentSong(playlist)
      expect(current?.id).toBe(2)
    })
  })

  describe('getNextIndex()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [
        createTestSong(1, 'Song 1'),
        createTestSong(2, 'Song 2'),
        createTestSong(3, 'Song 3')
      ])
    })

    it('should return -1 for empty playlist', () => {
      const emptyPlaylist = manager.createPlaylist()
      expect(manager.getNextIndex(emptyPlaylist)).toBe(-1)
    })

    it('should return next index in sequential mode', () => {
      playlist.currentIndex = 0
      playlist.playMode = PLAY_MODE.SEQUENTIAL

      expect(manager.getNextIndex(playlist)).toBe(1)
    })

    it('should wrap to 0 at end in list loop mode', () => {
      playlist.currentIndex = 2
      playlist.playMode = PLAY_MODE.LIST_LOOP

      expect(manager.getNextIndex(playlist)).toBe(0)
    })

    it('should return same index in single loop mode', () => {
      playlist.currentIndex = 1
      playlist.playMode = PLAY_MODE.SINGLE_LOOP

      expect(manager.getNextIndex(playlist)).toBe(1)
    })

    it('should handle wrap around with modulo', () => {
      playlist.currentIndex = 2
      playlist.playMode = PLAY_MODE.SEQUENTIAL

      // Sequential mode also uses modulo for next
      expect(manager.getNextIndex(playlist)).toBe(0)
    })
  })

  describe('getPrevIndex()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [
        createTestSong(1, 'Song 1'),
        createTestSong(2, 'Song 2'),
        createTestSong(3, 'Song 3')
      ])
    })

    it('should return -1 for empty playlist', () => {
      const emptyPlaylist = manager.createPlaylist()
      expect(manager.getPrevIndex(emptyPlaylist)).toBe(-1)
    })

    it('should return previous index', () => {
      playlist.currentIndex = 2

      expect(manager.getPrevIndex(playlist)).toBe(1)
    })

    it('should wrap to end when at beginning', () => {
      playlist.currentIndex = 0

      expect(manager.getPrevIndex(playlist)).toBe(2)
    })

    it('should return same index in single loop mode', () => {
      playlist.currentIndex = 1
      playlist.playMode = PLAY_MODE.SINGLE_LOOP

      expect(manager.getPrevIndex(playlist)).toBe(1)
    })
  })

  describe('setPlayMode()', () => {
    it('should set valid play mode', () => {
      manager.setPlayMode(playlist, PLAY_MODE.SHUFFLE)
      expect(playlist.playMode).toBe(PLAY_MODE.SHUFFLE)
    })

    it('should ignore invalid play mode', () => {
      playlist.playMode = PLAY_MODE.SEQUENTIAL
      manager.setPlayMode(playlist, 999 as any)

      expect(playlist.playMode).toBe(PLAY_MODE.SEQUENTIAL)
    })
  })

  describe('cyclePlayMode()', () => {
    it('should cycle through play modes', () => {
      expect(manager.cyclePlayMode(playlist)).toBe(PLAY_MODE.LIST_LOOP)
      expect(manager.cyclePlayMode(playlist)).toBe(PLAY_MODE.SINGLE_LOOP)
      expect(manager.cyclePlayMode(playlist)).toBe(PLAY_MODE.SHUFFLE)
      expect(manager.cyclePlayMode(playlist)).toBe(PLAY_MODE.SEQUENTIAL)
    })
  })

  describe('findSongIndex()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [
        createTestSong(1, 'Song 1'),
        createTestSong(2, 'Song 2'),
        createTestSong(3, 'Song 3')
      ])
    })

    it('should find song by id', () => {
      expect(manager.findSongIndex(playlist, 2)).toBe(1)
    })

    it('should return -1 if not found', () => {
      expect(manager.findSongIndex(playlist, 999)).toBe(-1)
    })

    it('should support string id', () => {
      manager.setPlaylist(playlist, [
        {
          id: 'string-id',
          name: 'String ID Song',
          artists: [],
          album: { id: 0, name: '', picUrl: '' },
          duration: 0,
          mvid: 0,
          platform: 'netease',
          originalId: 'string-id'
        }
      ])

      expect(manager.findSongIndex(playlist, 'string-id')).toBe(0)
    })
  })

  describe('isSongInPlaylist()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1'), createTestSong(2, 'Song 2')])
    })

    it('should return true if song exists', () => {
      expect(manager.isSongInPlaylist(playlist, 1)).toBe(true)
    })

    it('should return false if song not exists', () => {
      expect(manager.isSongInPlaylist(playlist, 999)).toBe(false)
    })
  })

  describe('addToNext()', () => {
    beforeEach(() => {
      manager.setPlaylist(playlist, [
        createTestSong(1, 'Song 1'),
        createTestSong(2, 'Song 2'),
        createTestSong(3, 'Song 3')
      ])
      playlist.currentIndex = 0
    })

    it('should add song after current', () => {
      const newSong = createTestSong(4, 'New Song')
      manager.addToNext(playlist, newSong)

      expect(playlist.list[1]).toEqual(newSong)
    })

    it('should move existing song to next position', () => {
      manager.addToNext(playlist, createTestSong(3, 'Song 3'))

      // Song 3 should now be at index 1 (after current)
      expect(playlist.list[1].id).toBe(3)
      expect(playlist.list).toHaveLength(3)
    })

    it('should adjust currentIndex when moving song from before current', () => {
      playlist.currentIndex = 2
      manager.addToNext(playlist, createTestSong(1, 'Song 1'))

      // Song 1 was at index 0 (before current 2), so currentIndex should decrease
      expect(playlist.currentIndex).toBe(1)
    })
  })

  describe('getPlaylistInfo()', () => {
    it('should return playlist info', () => {
      manager.setPlaylist(playlist, [createTestSong(1, 'Song 1'), createTestSong(2, 'Song 2')])
      playlist.currentIndex = 1

      const info = manager.getPlaylistInfo(playlist)

      expect(info.length).toBe(2)
      expect(info.currentIndex).toBe(1)
      expect(info.playMode).toBe(PLAY_MODE.SEQUENTIAL)
      expect(info.hasCurrentSong).toBe(true)
      expect(info.currentSong?.id).toBe(2)
    })

    it('should return correct info for empty playlist', () => {
      const info = manager.getPlaylistInfo(playlist)

      expect(info.length).toBe(0)
      expect(info.currentIndex).toBe(-1)
      expect(info.hasCurrentSong).toBe(false)
      expect(info.currentSong).toBeNull()
    })
  })
})
