import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '../../../src/store/playerStore'

// Mock audioManager
vi.mock('../../../src/utils/audioManager', () => ({
  audioManager: {
    play: vi.fn(),
    pause: vi.fn(),
    setVolume: vi.fn(),
    seek: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    get currentTime() { return 0 },
    get duration() { return 180 },
    get paused() { return true }
  }
}))

describe('Player Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('State Management', () => {
    it('should have correct initial state', () => {
      const store = usePlayerStore()
      
      expect(store.playing).toBe(false)
      expect(store.progress).toBe(0)
      expect(store.duration).toBe(0)
      expect(store.volume).toBe(0.7)
      expect(store.playMode).toBe(0)
      expect(store.currentSong).toBeNull()
      expect(store.songList).toEqual([])
      expect(store.currentIndex).toBe(-1)
    })

    it('should update playing state', () => {
      const store = usePlayerStore()
      
      store.playing = true
      expect(store.playing).toBe(true)
      
      store.playing = false
      expect(store.playing).toBe(false)
    })

    it('should update volume', () => {
      const store = usePlayerStore()
      
      store.volume = 0.5
      expect(store.volume).toBe(0.5)
    })

    it('should update playMode', () => {
      const store = usePlayerStore()
      
      store.playMode = 1
      expect(store.playMode).toBe(1)
    })
  })

  describe('Play Mode', () => {
    it('should cycle through play modes', () => {
      const store = usePlayerStore()
      
      // Initial: 0 (sequential)
      expect(store.playMode).toBe(0)
      
      // Toggle to next mode
      store.togglePlayMode()
      expect(store.playMode).toBe(1) // loop
      
      store.togglePlayMode()
      expect(store.playMode).toBe(2) // single
      
      store.togglePlayMode()
      expect(store.playMode).toBe(3) // random
      
      store.togglePlayMode()
      expect(store.playMode).toBe(0) // back to sequential
    })
  })

  describe('Lyric Type', () => {
    it('should have default lyric types', () => {
      const store = usePlayerStore()
      
      // Initial: ['original', 'trans']
      expect(store.lyricType).toEqual(['original', 'trans'])
    })

    it('should update lyric types', () => {
      const store = usePlayerStore()
      
      store.lyricType = ['original']
      expect(store.lyricType).toEqual(['original'])
      
      store.lyricType = ['original', 'trans', 'roma']
      expect(store.lyricType).toEqual(['original', 'trans', 'roma'])
    })
  })

  describe('Compact Mode', () => {
    it('should toggle compact mode', () => {
      const store = usePlayerStore()
      
      expect(store.isCompact).toBe(false)
      
      store.toggleCompactMode()
      expect(store.isCompact).toBe(true)
      
      store.toggleCompactMode()
      expect(store.isCompact).toBe(false)
    })
  })

  describe('Song Management', () => {
    it('should manage song list', () => {
      const store = usePlayerStore()
      const song1 = { id: 1, name: 'Song 1' }
      const song2 = { id: 2, name: 'Song 2' }
      
      // Add songs
      store.songList = [song1, song2]
      expect(store.songList).toHaveLength(2)
      
      // Remove song
      store.songList = [song2]
      expect(store.songList).toHaveLength(1)
      expect(store.songList[0]).toEqual(song2)
    })

    it('should clear playlist', () => {
      const store = usePlayerStore()
      store.songList = [{ id: 1 }, { id: 2 }]
      store.currentIndex = 0
      
      store.clearPlaylist()
      
      expect(store.songList).toHaveLength(0)
      expect(store.currentIndex).toBe(-1)
    })
  })

  describe('Lyric Management', () => {
    it('should set lyrics array', () => {
      const store = usePlayerStore()
      const lyrics = [
        { time: 0, lyric: 'Line 1', tlyric: '', rlyric: '' },
        { time: 5, lyric: 'Line 2', tlyric: '', rlyric: '' }
      ]
      
      store.setLyricsArray(lyrics)
      
      expect(store.lyricsArray).toEqual(lyrics)
    })

    it('should update lyric index', () => {
      const store = usePlayerStore()
      store.lyricsArray = [
        { time: 0, lyric: 'Line 1' },
        { time: 5, lyric: 'Line 2' },
        { time: 10, lyric: 'Line 3' }
      ]
      
      store.progress = 6
      store.updateLyricIndex()
      
      expect(store.currentLyricIndex).toBe(1)
    })
  })

  describe('Computed Properties', () => {
    it('should calculate current song info correctly', () => {
      const store = usePlayerStore()
      const song1 = { id: 1, name: 'Song 1' }
      const song2 = { id: 2, name: 'Song 2' }
      
      store.songList = [song1, song2]
      store.currentIndex = 1
      
      expect(store.currentSongInfo).toEqual(song2)
    })

    it('should return null when no songs', () => {
      const store = usePlayerStore()
      
      expect(store.currentSongInfo).toBeNull()
    })

    it('should return null when index out of range', () => {
      const store = usePlayerStore()
      store.songList = [{ id: 1 }]
      store.currentIndex = 5
      
      expect(store.currentSongInfo).toBeNull()
    })

    it('should check if has songs', () => {
      const store = usePlayerStore()
      
      expect(store.hasSongs).toBe(false)
      
      store.songList = [{ id: 1 }]
      expect(store.hasSongs).toBe(true)
    })

    it('should format play mode text', () => {
      const store = usePlayerStore()
      
      expect(store.playModeText).toBe('顺序播放')
      
      store.playMode = 1
      expect(store.playModeText).toBe('列表循环')
      
      store.playMode = 2
      expect(store.playModeText).toBe('单曲循环')
      
      store.playMode = 3
      expect(store.playModeText).toBe('随机播放')
    })
  })
})
