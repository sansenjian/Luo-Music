import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import { TEST_BASE_DATE, TIME_OFFSETS, getTestDate } from '../../utils/testConstants'
import { createMockSong, createQQSong } from '../test-utils'

const musicServiceMock = {
  getSongUrl: vi.fn()
}

describe('playbackErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(TEST_BASE_DATE)
  })

  it('retries fetching the song url on the first audio error', async () => {
    const state = {
      songList: [createQQSong({ id: 'song-1' })],
      currentIndex: 0,
      playMode: PLAY_MODE.LIST_LOOP
    }
    const onStateChange = vi.fn()
    musicServiceMock.getSongUrl.mockResolvedValue('https://song.test/retry.mp3')

    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
      getState: () => state,
      onStateChange
    })

    const result = await handler.handleAudioError(new Error('decode failed'), state.songList[0])

    expect(onStateChange).toHaveBeenCalledWith({ playing: false })
    expect(musicServiceMock.getSongUrl).toHaveBeenCalledWith('qq', 'song-1', {
      mediaId: undefined
    })
    expect(result).toEqual({
      shouldRetry: true,
      url: 'https://song.test/retry.mp3'
    })
    expect(state.songList[0].url).toBe('https://song.test/retry.mp3')
  })

  it('marks songs unavailable when retrying audio playback fails', async () => {
    const song = createQQSong({ id: 'song-2', extra: { mediaId: 'media-2' } })
    const state = {
      songList: [song],
      currentIndex: 0,
      playMode: PLAY_MODE.LIST_LOOP
    }
    musicServiceMock.getSongUrl.mockResolvedValue(null)

    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
      getState: () => state
    })

    const result = await handler.handleAudioError('unknown', song)

    expect(musicServiceMock.getSongUrl).toHaveBeenCalledWith('qq', 'song-2', {
      mediaId: 'media-2'
    })
    expect(result).toEqual({
      shouldRetry: false,
      shouldSkip: true
    })
    expect(song.unavailable).toBe(true)
    expect(song.errorMessage).toBeTruthy()
    expect(handler.getUnavailableSongs()).toEqual(['song-2'])
  })

  it('does not retry remote url resolution for local songs', async () => {
    const localSong = createMockSong({
      id: 'local:track-1',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\track.mp3'
      }
    })
    const state = {
      songList: [localSong],
      currentIndex: 0,
      playMode: PLAY_MODE.LIST_LOOP
    }

    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
      getState: () => state
    })

    const result = await handler.handleAudioError(new Error('decode failed'), localSong)

    expect(musicServiceMock.getSongUrl).not.toHaveBeenCalled()
    expect(result).toEqual({
      shouldRetry: false,
      shouldSkip: true
    })
    expect(localSong.errorMessage).toContain('本地文件无法播放')
  })

  it('stops skipping after too many rapid attempts or when most songs are unavailable', () => {
    const songs = [
      createMockSong({ id: 1 }),
      createMockSong({ id: 2, unavailable: true }),
      createMockSong({ id: 3, unavailable: true }),
      createMockSong({ id: 4, unavailable: true }),
      createMockSong({ id: 5, unavailable: true }),
      createMockSong({ id: 6, unavailable: true })
    ]

    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
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
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_100))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_200))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_300))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_400))
    expect(handler.shouldStopSkipping()).toBe(false)
    vi.setSystemTime(getTestDate(TIME_OFFSETS.MS_500))
    expect(handler.shouldStopSkipping()).toBe(true)
  })

  it('plays the next available song and marks failed candidates unavailable', async () => {
    const songs = [
      createMockSong({ id: 1 }),
      createMockSong({ id: 2, unavailable: true }),
      createMockSong({ id: 3 }),
      createMockSong({ id: 4 })
    ]

    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
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
    const songs = [createMockSong({ id: 1 }), createMockSong({ id: 2, unavailable: true })]
    const handler = new PlaybackErrorHandler({
      musicService: musicServiceMock,
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
