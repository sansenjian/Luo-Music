import { describe, it, expect, beforeEach } from 'vitest'
import { usePlaylistStore } from '../../../src/store/playlistStore'
import { usePlayerStore } from '../../../src/store/playerStore'
import { setActivePinia, createPinia } from 'pinia'

describe('Playlist Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default state', () => {
    const store = usePlaylistStore()
    expect(store.songs).toEqual([])
    expect(store.currentIndex).toBe(-1)
    expect(store.currentSong).toBeNull()
  })

  it('should set playlist correctly', () => {
    const store = usePlaylistStore()
    const songs = [
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
    ]
    store.setPlaylist(songs)
    expect(store.songs).toHaveLength(2)
    expect(store.currentIndex).toBe(0)
    expect(store.currentSong).toEqual(songs[0])
  })

  it('should add song to playlist', () => {
    const store = usePlaylistStore()
    store.addSong({ id: 1, name: 'Song 1' })
    expect(store.songs).toHaveLength(1)
    store.addSong({ id: 2, name: 'Song 2' })
    expect(store.songs).toHaveLength(2)
  })

  it('should remove song from playlist', () => {
    const store = usePlaylistStore()
    store.setPlaylist([
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
      { id: 3, name: 'Song 3' },
    ])
    store.removeSong(1)
    expect(store.songs).toHaveLength(2)
    expect(store.songs[1].id).toBe(3)
  })

  it('should play at specific index', () => {
    const store = usePlaylistStore()
    store.setPlaylist([
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
      { id: 3, name: 'Song 3' },
    ])
    const song = store.playAt(2)
    expect(store.currentIndex).toBe(2)
    expect(song.id).toBe(3)
  })

  it('should handle next with different play modes', () => {
    const store = usePlaylistStore()
    store.setPlaylist([
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
      { id: 3, name: 'Song 3' },
    ])

    // Sequential mode (playMode = 0)
    store.next(0)
    expect(store.currentIndex).toBe(1)

    // Loop mode (playMode = 1)
    store.playAt(2)
    store.next(1)
    expect(store.currentIndex).toBe(0)

    // Random mode (playMode = 3)
    store.next(3)
    expect(store.currentIndex).toBeGreaterThanOrEqual(0)
    expect(store.currentIndex).toBeLessThan(3)
  })

  it('should handle prev with different play modes', () => {
    const store = usePlaylistStore()
    store.setPlaylist([
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
      { id: 3, name: 'Song 3' },
    ])
    store.playAt(1)

    // Sequential mode
    store.prev(0)
    expect(store.currentIndex).toBe(0)

    // Loop mode
    store.playAt(0)
    store.prev(1)
    expect(store.currentIndex).toBe(2)
  })

  it('should clear playlist', () => {
    const store = usePlaylistStore()
    store.setPlaylist([
      { id: 1, name: 'Song 1' },
      { id: 2, name: 'Song 2' },
    ])
    store.clearPlaylist()
    expect(store.songs).toEqual([])
    expect(store.currentIndex).toBe(-1)
  })
})
