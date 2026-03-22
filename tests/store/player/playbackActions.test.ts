import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { createInitialState } from '@/store/player/playerState'
import { PlaybackActions } from '@/store/player/playbackActions'
import type { Song } from '@/platform/music/interface'
import type { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'

type MockPlaybackErrorHandler = PlaybackErrorHandler & {
  markAsUnavailable: ReturnType<typeof vi.fn>
  playNextSkipUnavailable: ReturnType<typeof vi.fn>
}

const adapterMock = vi.hoisted(() => ({
  getSongUrl: vi.fn(),
  getLyric: vi.fn()
}))

const getMusicAccessorMock = vi.hoisted(() => vi.fn(() => adapterMock))
const lyricParseMock = vi.hoisted(() => vi.fn())
const errorEmitMock = vi.hoisted(() => vi.fn())
const noCopyrightMock = vi.hoisted(() =>
  vi.fn((id: string | number) => {
    const error = new Error(`no copyright: ${id}`)
    error.name = 'AppError'
    ;(error as Error & { getUserMessage: () => string }).getUserMessage = () =>
      `No copyright for ${id}`
    return error
  })
)
const fatalErrorMock = vi.hoisted(() => vi.fn((message: string) => new Error(message)))
const isCanceledRequestErrorMock = vi.hoisted(() =>
  vi.fn((error: unknown) => Boolean((error as { __cancel?: boolean })?.__cancel))
)

vi.mock('@/services/musicAccessor', () => ({
  getMusicAccessor: getMusicAccessorMock
}))

vi.mock('@/utils/player/core/lyric', () => ({
  LyricParser: {
    parse: lyricParseMock
  }
}))

vi.mock('@/utils/error', () => ({
  errorCenter: {
    emit: errorEmitMock
  },
  Errors: {
    noCopyright: noCopyrightMock,
    fatal: fatalErrorMock
  }
}))

vi.mock('@/utils/http/cancelError', () => ({
  isCanceledRequestError: isCanceledRequestErrorMock
}))

function createSong(overrides: Partial<Song> & Record<string, unknown> = {}): Song {
  return {
    id: 1,
    name: 'Test Song',
    artists: [],
    album: { id: 1, name: 'Album', picUrl: '' },
    duration: 100,
    mvid: 0,
    platform: 'qq',
    originalId: 1,
    ...overrides
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe('playbackActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createSubject() {
    const state = createInitialState()
    const onStateChange = vi.fn((changes: Partial<typeof state>) => Object.assign(state, changes))
    const playSongByIndex = vi.fn().mockResolvedValue(undefined)
    const setLyricsArray = vi.fn()
    const errorHandler: MockPlaybackErrorHandler = {
      markAsUnavailable: vi.fn(),
      playNextSkipUnavailable: vi.fn()
    } as unknown as MockPlaybackErrorHandler

    const actions = new PlaybackActions({
      getState: () => state,
      onStateChange,
      playSongByIndex,
      setLyricsArray,
      createErrorHandler: vi.fn(() => errorHandler),
      getErrorHandler: vi.fn(() => errorHandler),
      platform: {
        isElectron: vi.fn(() => false)
      }
    })

    return {
      actions,
      state,
      onStateChange,
      playSongByIndex,
      setLyricsArray,
      errorHandler
    }
  }

  it('handles random index generation edge cases', () => {
    const { actions, state } = createSubject()

    expect(actions.getRandomIndex()).toBe(-1)

    state.songList = [createSong()]
    expect(actions.getRandomIndex()).toBe(0)

    state.songList = [createSong({ id: 1 }), createSong({ id: 2 })]
    state.currentIndex = 0
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(actions.getRandomIndex()).toBe(1)
  })

  it('navigates previous and next songs according to play mode', () => {
    const { actions, state } = createSubject()
    state.songList = [createSong({ id: 1 }), createSong({ id: 2 }), createSong({ id: 3 })]
    state.currentIndex = 0

    const playSongWithDetails = vi
      .spyOn(actions, 'playSongWithDetails')
      .mockResolvedValue(undefined)

    actions.playPrev()
    expect(playSongWithDetails).toHaveBeenCalledWith(2)

    state.currentIndex = 2
    state.playMode = PLAY_MODE.SEQUENTIAL
    actions.playNext()
    expect(playSongWithDetails).toHaveBeenCalledTimes(1)

    state.playMode = PLAY_MODE.LIST_LOOP
    actions.playNext()
    expect(playSongWithDetails).toHaveBeenCalledWith(0)
  })

  it('plays an already-resolved song by index', async () => {
    const { actions, state, onStateChange, playSongByIndex } = createSubject()
    state.songList = [createSong({ url: 'https://song.test/1.mp3' })]

    await actions.playSongByIndex(0)

    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 0,
      currentSong: state.songList[0]
    })
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })

  it('throws when playSongByIndex is asked to play a song without a url', async () => {
    const { actions, state } = createSubject()
    state.songList = [createSong()]

    await expect(actions.playSongByIndex(0)).rejects.toThrow('No URL for song')
  })

  it('fetches song url, plays it, and parses lyrics', async () => {
    const { actions, state, setLyricsArray, playSongByIndex, onStateChange } = createSubject()
    const song = createSong({ id: 'song-1', mediaId: 'media-1' })
    state.songList = [song]
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/stream.mp3')
    adapterMock.getLyric.mockResolvedValue({
      lrc: '[00:00.00]main',
      tlyric: '[00:00.00]trans',
      romalrc: '[00:00.00]roma'
    })
    lyricParseMock.mockReturnValue([{ time: 0, text: 'main', trans: 'trans', roma: 'roma' }])

    await actions.playSongWithDetails(0)

    expect(getMusicAccessorMock).toHaveBeenCalled()
    expect(adapterMock.getSongUrl).toHaveBeenCalledWith('qq', 'song-1', {
      mediaId: 'media-1'
    })
    expect(song.url).toBe('https://song.test/stream.mp3')
    expect(playSongByIndex).toHaveBeenCalledWith(0)
    expect(setLyricsArray).toHaveBeenCalledWith([
      { time: 0, text: 'main', trans: 'trans', roma: 'roma' }
    ])
    expect(onStateChange).toHaveBeenCalledWith({ loading: true })
    expect(onStateChange).toHaveBeenLastCalledWith({ loading: false })
  })

  it('keeps current lyrics when lyric loading is cancelled', async () => {
    const { actions, state, setLyricsArray } = createSubject()
    state.songList = [createSong({ url: 'https://song.test/ready.mp3' })]
    adapterMock.getLyric.mockRejectedValue({ __cancel: true })

    await actions.playSongWithDetails(0)

    expect(isCanceledRequestErrorMock).toHaveBeenCalled()
    expect(setLyricsArray).not.toHaveBeenCalled()
  })

  it('ignores stale lyric responses from superseded playback requests', async () => {
    const { actions, state, setLyricsArray } = createSubject()
    state.songList = [
      createSong({ id: 'song-1', url: 'https://song.test/1.mp3' }),
      createSong({ id: 'song-2', url: 'https://song.test/2.mp3' })
    ]

    const firstLyric = createDeferred<{ lrc: string; tlyric: string; romalrc: string }>()
    const secondLyric = createDeferred<{ lrc: string; tlyric: string; romalrc: string }>()

    adapterMock.getLyric
      .mockImplementationOnce(() => firstLyric.promise)
      .mockImplementationOnce(() => secondLyric.promise)
    lyricParseMock.mockImplementation((lrc: string) => [
      {
        time: 0,
        text: lrc.includes('New line') ? 'New line' : 'Old line',
        trans: '',
        roma: ''
      }
    ])

    const firstPlayback = actions.playSongWithDetails(0)
    const secondPlayback = actions.playSongWithDetails(1)

    secondLyric.resolve({
      lrc: '[00:00.00]New line',
      tlyric: '',
      romalrc: ''
    })
    await secondPlayback

    firstLyric.resolve({
      lrc: '[00:00.00]Old line',
      tlyric: '',
      romalrc: ''
    })
    await firstPlayback

    expect(setLyricsArray).toHaveBeenCalledTimes(1)
    expect(setLyricsArray).toHaveBeenCalledWith([
      { time: 0, text: 'New line', trans: '', roma: '' }
    ])
  })

  it('marks songs unavailable and rethrows when auto skip is disabled', async () => {
    const { actions, state, errorHandler } = createSubject()
    state.songList = [createSong({ id: 'vip-song' })]
    adapterMock.getSongUrl.mockResolvedValue(null)

    await expect(actions.playSongWithDetails(0, false)).rejects.toThrow()

    expect(noCopyrightMock).toHaveBeenCalledWith('vip-song')
    expect(errorEmitMock).toHaveBeenCalled()
    expect(errorHandler.markAsUnavailable).toHaveBeenCalledWith(
      state.songList[0],
      'No copyright for vip-song'
    )
  })

  it('auto skips to the next available song after playback errors', async () => {
    const { actions, state } = createSubject()
    state.songList = [createSong({ id: 'bad-song' })]
    adapterMock.getSongUrl.mockRejectedValue(new Error('network'))
    const playNextSkipUnavailable = vi
      .spyOn(actions, 'playNextSkipUnavailable')
      .mockResolvedValue(undefined)

    await expect(actions.playSongWithDetails(0)).resolves.toBeUndefined()
    expect(playNextSkipUnavailable).toHaveBeenCalled()
  })

  it('delegates playNextSkipUnavailable to the error handler callback', async () => {
    const { actions, errorHandler } = createSubject()
    const playSongWithDetails = vi
      .spyOn(actions, 'playSongWithDetails')
      .mockResolvedValue(undefined)

    errorHandler.playNextSkipUnavailable.mockImplementation(
      async (runner: (index: number) => Promise<void>) => {
        await runner(2)
      }
    )

    await actions.playNextSkipUnavailable()

    expect(errorHandler.playNextSkipUnavailable).toHaveBeenCalled()
    expect(playSongWithDetails).toHaveBeenCalledWith(2, false)
  })
})
