import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from '../src/store/playerStore'
import { setActivePinia, createPinia } from 'pinia'

describe('Player Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default state', () => {
    const store = usePlayerStore()
    expect(store.playing).toBe(false)
    expect(store.volume).toBe(0.7)
    expect(store.playMode).toBe(0)
    expect(store.songList).toEqual([])
  })

  it('should set volume within valid range', () => {
    const store = usePlayerStore()
    store.setVolume(1.5)
    expect(store.volume).toBe(1)
    store.setVolume(-0.5)
    expect(store.volume).toBe(0)
  })

  it('should toggle play mode correctly', () => {
    const store = usePlayerStore()
    expect(store.playMode).toBe(0)
    store.togglePlayMode()
    expect(store.playMode).toBe(1)
    store.togglePlayMode()
    expect(store.playMode).toBe(2)
    store.togglePlayMode()
    expect(store.playMode).toBe(3)
    store.togglePlayMode()
    expect(store.playMode).toBe(0)
  })

  it('should update lyric index using binary search', () => {
    const store = usePlayerStore()
    store.lyricsArray = [
      { time: 0, lyric: 'Line 1' },
      { time: 5, lyric: 'Line 2' },
      { time: 10, lyric: 'Line 3' },
      { time: 15, lyric: 'Line 4' },
    ]
    store.progress = 7
    store.updateLyricIndex()
    expect(store.currentLyricIndex).toBe(1)
  })
})
