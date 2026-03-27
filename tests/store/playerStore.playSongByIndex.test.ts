import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const playerCorePlayMock = vi.hoisted(() => vi.fn())
const playerCorePauseMock = vi.hoisted(() => vi.fn())
const playerCoreSeekMock = vi.hoisted(() => vi.fn())
const playerCoreSetVolumeMock = vi.hoisted(() => vi.fn())
const playerCoreOnMock = vi.hoisted(() => vi.fn(() => () => {}))
const playerCoreGetMutedMock = vi.hoisted(() => vi.fn(() => false))
const playerCoreSetMutedMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/utils/player/core/playerCore', () => ({
  playerCore: {
    play: playerCorePlayMock,
    pause: playerCorePauseMock,
    seek: playerCoreSeekMock,
    setVolume: playerCoreSetVolumeMock,
    on: playerCoreOnMock,
    getMuted: playerCoreGetMutedMock,
    setMuted: playerCoreSetMutedMock,
    get currentTime() {
      return 0
    },
    get duration() {
      return 180
    }
  }
}))

import { usePlayerStore } from '../../src/store/playerStore'
import type { Song } from '../../src/platform/music/interface'

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 1,
    name: 'Song',
    artists: [{ id: 1, name: 'Artist' }],
    album: { id: 1, name: 'Album', picUrl: '' },
    duration: 180000,
    mvid: 0,
    platform: 'netease',
    originalId: 1,
    ...overrides
  }
}

describe('playerStore.playSongByIndex', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not mutate current track selection before audio playback succeeds', async () => {
    const store = usePlayerStore()
    const firstSong = createSong({ id: 'song-1', name: 'First', url: 'https://song.test/1.mp3' })
    const secondSong = createSong({ id: 'song-2', name: 'Second', url: 'https://song.test/2.mp3' })

    store.songList = [firstSong, secondSong]
    store.currentIndex = 0
    store.currentSong = firstSong

    playerCorePlayMock.mockRejectedValueOnce(new Error('playback failed'))

    await expect(store.playSongByIndex(1)).rejects.toThrow('playback failed')

    expect(store.currentIndex).toBe(0)
    expect(store.currentSong).toStrictEqual(firstSong)
  })
})
