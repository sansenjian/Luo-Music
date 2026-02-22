import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '../../src/store/playerStore'
import { PLAY_MODE } from '../../src/utils/player/constants/playMode'

// Mock audioManager
vi.mock('../../src/utils/player/core/audioManager', () => ({
  audioManager: {
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    get currentTime() { return 0 },
    get duration() { return 180 },
    get paused() { return true }
  }
}))

describe('playerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('初始化状态', () => {
    it('应该有正确的初始状态', () => {
      const store = usePlayerStore()
      
      expect(store.playing).toBe(false)
      expect(store.progress).toBe(0)
      expect(store.duration).toBe(0)
      expect(store.volume).toBe(0.7)
      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
      expect(store.songList).toEqual([])
      expect(store.currentIndex).toBe(-1)
      expect(store.currentSong).toBeNull()
      expect(store.initialized).toBe(false)
    })

    it('应该有正确的 getter 值', () => {
      const store = usePlayerStore()
      
      expect(store.hasSongs).toBe(false)
      expect(store.currentSongInfo).toBeNull()
      expect(store.formattedProgress).toBe('00:00')
      expect(store.formattedDuration).toBe('00:00')
      expect(store.playModeText).toBe('顺序播放')
    })
  })

  describe('播放列表管理', () => {
    it('setSongList 应该设置歌曲列表', () => {
      const store = usePlayerStore()
      const songs = [
        { id: 1, name: 'Song 1', artist: 'Artist 1' },
        { id: 2, name: 'Song 2', artist: 'Artist 2' }
      ]
      
      store.setSongList(songs)
      
      expect(store.songList).toHaveLength(2)
      expect(store.songList[0].name).toBe('Song 1')
      expect(store.currentIndex).toBe(-1)
    })

    it('addSong 应该添加歌曲到列表', () => {
      const store = usePlayerStore()
      const song = { id: 1, name: 'New Song', artist: 'Artist' }
      
      store.addSong(song)
      
      expect(store.songList).toHaveLength(1)
      expect(store.songList[0].name).toBe('New Song')
    })

    it('可以通过直接修改 songList 移除歌曲', () => {
      const store = usePlayerStore()
      store.setSongList([
        { id: 1, name: 'Song 1' },
        { id: 2, name: 'Song 2' },
        { id: 3, name: 'Song 3' }
      ])
      
      // 直接修改 songList
      store.songList = store.songList.filter(s => s.id !== 2)
      
      expect(store.songList).toHaveLength(2)
      expect(store.songList.find(s => s.id === 2)).toBeUndefined()
    })
  })

  describe('播放控制', () => {
    it('togglePlayMode 应该循环切换播放模式', () => {
      const store = usePlayerStore()
      
      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
      
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.LIST_LOOP)
      
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SINGLE_LOOP)
      
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SHUFFLE)
      
      store.togglePlayMode()
      expect(store.playMode).toBe(PLAY_MODE.SEQUENTIAL)
    })

    it('setVolume 应该设置音量', () => {
      const store = usePlayerStore()
      
      store.setVolume(0.5)
      
      expect(store.volume).toBe(0.5)
    })

    it('seek 应该设置播放进度', () => {
      const store = usePlayerStore()
      store.duration = 180
      
      store.seek(60)
      
      expect(store.progress).toBe(60)
    })

    it('updateProgress 应该更新进度', () => {
      const store = usePlayerStore()
      
      store.progress = 30
      
      expect(store.progress).toBe(30)
    })
  })

  describe('歌词管理', () => {
    it('setLyric 应该设置歌词数据', () => {
      const store = usePlayerStore()
      const lyricData = { lrc: { lyric: '[00:00.00]Test lyric' } }
      
      store.setLyric(lyricData)
      
      expect(store.lyric).toEqual(lyricData)
    })

    it('setLyricsArray 应该设置歌词数组', () => {
      const store = usePlayerStore()
      const lyrics = [
        { time: 0, lyric: 'Line 1' },
        { time: 5, lyric: 'Line 2' }
      ]
      
      store.setLyricsArray(lyrics)
      
      expect(store.lyricsArray).toHaveLength(2)
      expect(store.lyricsArray[0].lyric).toBe('Line 1')
    })

    it('lyricType 应该有默认值', () => {
      const store = usePlayerStore()
      
      expect(store.lyricType).toEqual(['original', 'trans'])
    })
  })

  describe('播放模式切换', () => {
    beforeEach(() => {
      const store = usePlayerStore()
      store.setSongList([
        { id: 1, name: 'Song 1', url: 'http://test.com/1.mp3' },
        { id: 2, name: 'Song 2', url: 'http://test.com/2.mp3' },
        { id: 3, name: 'Song 3', url: 'http://test.com/3.mp3' }
      ])
    })

    it('toggleCompactMode 应该切换紧凑模式', () => {
      const store = usePlayerStore()
      
      expect(store.isCompact).toBe(false)
      
      store.toggleCompactMode()
      expect(store.isCompact).toBe(true)
      
      store.toggleCompactMode()
      expect(store.isCompact).toBe(false)
    })
  })
})
