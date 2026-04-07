import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlayerStore } from '../../src/store/playerStore'
import { createMockSong } from '../utils/test-utils'

const createAudioManagerMock = () => ({
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  getMuted: vi.fn(() => false),
  setMuted: vi.fn()
})

describe('playerStore.playSongByIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not mutate current track selection before audio playback succeeds', async () => {
    const audioManager = createAudioManagerMock()
    const usePlayerStore = createPlayerStore(
      {
        audioManager,
        getPlatformAccessor: () => ({
          isElectron: () => false,
          send: vi.fn(),
          sendPlayingState: vi.fn(),
          sendPlayModeChange: vi.fn(),
          on: vi.fn(() => () => {})
        })
      },
      'player-playbyindex-test'
    )
    const store = usePlayerStore()
    const firstSong = createMockSong({
      id: 'song-1',
      name: 'First',
      url: 'https://song.test/1.mp3'
    })
    const secondSong = createMockSong({
      id: 'song-2',
      name: 'Second',
      url: 'https://song.test/2.mp3'
    })

    store.songList = [firstSong, secondSong]
    store.currentIndex = 0
    store.currentSong = firstSong
    store.initialized = true

    audioManager.play.mockRejectedValueOnce(new Error('playback failed'))

    await expect(store.playSongByIndex(1)).rejects.toThrow('playback failed')

    expect(store.currentIndex).toBe(0)
    expect(store.currentSong).toStrictEqual(firstSong)
  })
})
