import { describe, expect, it } from 'vitest'

import { sanitizePersistedPlayerState } from '@/utils/storage/appStorage'
import { createMockSong } from '../../utils/test-utils'

describe('appStorage player state sanitizer', () => {
  it('preserves safe playback queue state for startup restore', () => {
    const currentSong = createMockSong({
      id: 2,
      name: 'Persisted Song',
      url: 'https://song.test/current.mp3',
      retryCount: 2,
      unavailable: true,
      errorMessage: 'stale playback error'
    })

    const result = sanitizePersistedPlayerState({
      volume: 0.4,
      playMode: 2,
      lyricType: ['original', 'trans'],
      webLyricAppearance: undefined,
      isPlayerDocked: false,
      songList: [createMockSong({ id: 1, name: 'First Song' }), currentSong],
      currentIndex: 1,
      progress: 64,
      duration: 180
    })

    expect(result.version).toBe(1)
    expect(result.volume).toBe(0.4)
    expect(result.playMode).toBe(2)
    expect(result.isPlayerDocked).toBe(false)
    expect(result.songList).toHaveLength(2)
    expect(result.currentIndex).toBe(1)
    expect(result.progress).toBe(64)
    expect(result.duration).toBe(180)
    expect(result.songList[1]).toMatchObject({
      id: 2,
      name: 'Persisted Song'
    })
    expect(result.songList[1]?.url).toBeUndefined()
    expect(result.songList[1]?.retryCount).toBeUndefined()
    expect(result.songList[1]?.unavailable).toBeUndefined()
    expect(result.songList[1]?.errorMessage).toBeUndefined()
  })

  it('drops invalid queue entries and clamps progress to duration', () => {
    const result = sanitizePersistedPlayerState({
      songList: [{ id: 1 }, createMockSong({ id: 2, name: 'Valid Song' })],
      currentIndex: 9,
      progress: 300,
      duration: 120
    })

    expect(result.songList).toHaveLength(1)
    expect(result.currentIndex).toBe(0)
    expect(result.progress).toBe(120)
    expect(result.duration).toBe(120)
  })

  it('derives duration from the current song metadata when persisted duration is missing', () => {
    const result = sanitizePersistedPlayerState({
      songList: [createMockSong({ id: 1, name: 'Metadata Song', duration: 210000 })],
      currentIndex: 0,
      progress: 42,
      duration: 0
    })

    expect(result.duration).toBe(210)
    expect(result.progress).toBe(42)
  })
})
