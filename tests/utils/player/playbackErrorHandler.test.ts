import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import type { Song } from '@/platform/music/interface'

const adapterMock = vi.hoisted(() => ({
  getSongUrl: vi.fn()
}))

const getMusicAdapterMock = vi.hoisted(() => vi.fn(() => adapterMock))

vi.mock('@/platform/music', () => ({
  getMusicAdapter: getMusicAdapterMock
}))

function createSong(overrides: Partial<Song> & Record<string, unknown> = {}): Song {
  return {
    id: 1,
    name: 'Song',
    artists: [],
    album: { id: 1, name: 'Album', picUrl: '' },
    duration: 100,
    mvid: 0,
    platform: 'qq',
    originalId: 1,
    ...overrides
  }
}

describe('playbackErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'))
  })

  it('retries fetching the song url on the first audio error', async () => {
    const state = {
      songList: [createSong({ id: 'song-1' })],
      currentIndex: 0,
      playMode: PLAY_MODE.LIST_LOOP
    }
    const onStateChange = vi.fn()
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/retry.mp3')

    const handler = new PlaybackErrorHandler({
      getState: () => state,
      onStateChange
    })

    const result = await handler.handleAudioError(new Error('decode failed'), state.songList[0])

    expect(onStateChange).toHaveBeenCalledWith({ playing: false })
    expect(adapterMock.getSongUrl).toHaveBeenCalledWith('song-1', { mediaId: undefined })
    expect(result).toEqual({
      shouldRetry: true,
      url: 'https://song.test/retry.mp3'
    })
    expect(state.songList[0].url).toBe('https://song.test/retry.mp3')
  })

  it('marks songs unavailable when retrying audio playback fails', async () => {
    const song = createSong({ id: 'song-2', extra: { mediaId: 'media-2' } })
    const state = {
      songList: [song],
      currentIndex: 0,
      playMode: PLAY_MODE.LIST_LOOP
    }
    adapterMock.getSongUrl.mockResolvedValue(null)

    const handler = new PlaybackErrorHandler({
      getState: () => state
    })

    const result = await handler.handleAudioError('unknown', song)

    expect(adapterMock.getSongUrl).toHaveBeenCalledWith('song-2', { mediaId: 'media-2' })
    expect(result).toEqual({
      shouldRetry: false,
      shouldSkip: true
    })
    expect(song.unavailable).toBe(true)
    expect(song.errorMessage).toBeTruthy()
    expect(handler.getUnavailableSongs()).toEqual(['song-2'])
  })

  it('stops skipping after too many rapid attempts or when most songs are unavailable', () => {
    const songs = [
      createSong({ id: 1 }),
      createSong({ id: 2, unavailable: true }),
      createSong({ id: 3, unavailable: true }),
      createSong({ id: 4, unavailable: true }),
      createSong({ id: 5, unavailable: true }),
      createSong({ id: 6, unavailable: true })
    ]

    const handler = new PlaybackErrorHandler({
      getState: () => ({
        songList: songs,
        currentIndex: 0,
        playMode: PLAY_MODE.LIST_LOOP
      })
    })

    handler.markAsUnavailable(songs[1])
    handler.markAsUnavailable(songs[2])
    handler.markAsUnavailable(songs[3])
    handler.markAsUnavailable(songs[4])
    handler.markAsUnavailable(songs[5])

    expect(handler.shouldStopSkipping()).toBe(true)

    handler.reset()
    vi.setSystemTime(new Date('2026-03-17T00:00:00.100Z'))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(new Date('2026-03-17T00:00:00.200Z'))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(new Date('2026-03-17T00:00:00.300Z'))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(new Date('2026-03-17T00:00:00.400Z'))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(new Date('2026-03-17T00:00:00.500Z'))
    expect(handler.shouldStopSkipping()).toBe(true)
  })

  it('plays the next available song and marks failed candidates unavailable', async () => {
    const songs = [
      createSong({ id: 1 }),
      createSong({ id: 2, unavailable: true }),
      createSong({ id: 3 }),
      createSong({ id: 4 })
    ]

    const handler = new PlaybackErrorHandler({
      getState: () => ({
        songList: songs,
        currentIndex: 0,
        playMode: PLAY_MODE.LIST_LOOP
      })
    })

    const playNext = vi
      .fn()
      .mockRejectedValueOnce(new Error('song 3 failed'))
      .mockResolvedValueOnce(undefined)

    await handler.playNextSkipUnavailable(playNext)

    expect(playNext).toHaveBeenNthCalledWith(1, 2)
    expect(playNext).toHaveBeenNthCalledWith(2, 3)
    expect(songs[2].unavailable).toBe(true)
  })

  it('supports shuffle index selection and reset', () => {
    const songs = [createSong({ id: 1 }), createSong({ id: 2, unavailable: true })]
    const handler = new PlaybackErrorHandler({
      getState: () => ({
        songList: songs,
        currentIndex: 0,
        playMode: PLAY_MODE.SHUFFLE
      })
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    handler.markAsUnavailable(songs[0], 'bad')
    expect(handler.getNextAvailableIndex(0, 0)).toBe(1)

    handler.reset()
    expect(handler.getUnavailableSongs()).toEqual([])
    expect(songs[0].unavailable).toBe(false)
    expect(songs[0].errorMessage).toBeNull()
  })
})
