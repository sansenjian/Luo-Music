import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { createInitialState } from '@/store/player/playerState'
import { PlaybackActions } from '@/store/player/playbackActions'
import type { Song } from '@/types/schemas'
import type { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import { createMockSong, createQQSong } from '../../utils/test-utils'

type MockPlaybackErrorHandler = PlaybackErrorHandler & {
  markAsUnavailable: ReturnType<typeof vi.fn>
  playNextSkipUnavailable: ReturnType<typeof vi.fn>
}

const adapterMock = vi.hoisted(() => ({
  getSongUrl: vi.fn(),
  getSongDetail: vi.fn(),
  getLyric: vi.fn()
}))

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
    const setLyricsArray = vi.fn((lyrics: typeof state.lyricsArray) => {
      state.lyricsArray = lyrics
      state.lyricSong = lyrics.length > 0 ? state.currentSong : null
      state.currentLyricIndex = lyrics.length > 0 ? 0 : -1
    })
    const errorHandler: MockPlaybackErrorHandler = {
      markAsUnavailable: vi.fn(),
      playNextSkipUnavailable: vi.fn()
    } as unknown as MockPlaybackErrorHandler

    const actions = new PlaybackActions({
      getState: () => state,
      onStateChange,
      playSongByIndex,
      setLyricsArray,
      musicService: adapterMock,
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

    state.songList = [createMockSong()]
    expect(actions.getRandomIndex()).toBe(0)

    state.songList = [createMockSong({ id: 1 }), createMockSong({ id: 2 })]
    state.currentIndex = 0
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(actions.getRandomIndex()).toBe(1)
  })

  it('navigates previous and next songs according to play mode', () => {
    const { actions, state } = createSubject()
    state.songList = [
      createMockSong({ id: 1 }),
      createMockSong({ id: 2 }),
      createMockSong({ id: 3 })
    ]
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
    state.songList = [createMockSong({ url: 'https://song.test/1.mp3' })]

    await actions.playSongByIndex(0)

    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 0,
      currentSong: state.songList[0],
      currentLyricIndex: -1
    })
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })

  it('preserves the current lyric index when reselecting the same song', async () => {
    const { actions, state, onStateChange, playSongByIndex, setLyricsArray } = createSubject()
    const song = createMockSong({ id: 'song-1', url: 'https://song.test/1.mp3' })
    state.songList = [song]
    state.currentSong = song
    state.currentIndex = 0
    state.currentLyricIndex = 12

    await actions.playSongByIndex(0)

    expect(setLyricsArray).not.toHaveBeenCalled()
    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 0,
      currentSong: song,
      currentLyricIndex: 12
    })
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })

  it('throws when playSongByIndex is asked to play a song without a url', async () => {
    const { actions, state } = createSubject()
    state.songList = [createMockSong()]

    await expect(actions.playSongByIndex(0)).rejects.toThrow('No URL for song')
  })

  it('fetches song url, plays it, and parses lyrics', async () => {
    const { actions, state, setLyricsArray, playSongByIndex, onStateChange } = createSubject()
    const song = createQQSong({ id: 'song-1', mediaId: 'media-1' })
    state.songList = [song]
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/stream.mp3')
    adapterMock.getLyric.mockResolvedValue({
      lrc: '[00:00.00]main',
      tlyric: '[00:00.00]trans',
      romalrc: '[00:00.00]roma'
    })
    lyricParseMock.mockReturnValue([{ time: 0, text: 'main', trans: 'trans', roma: 'roma' }])

    await actions.playSongWithDetails(0)

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

  it('hydrates netease search-result songs before fetching the playback url', async () => {
    const { actions, state } = createSubject()
    const song = createMockSong({
      id: 'song-netease-search',
      platform: 'netease',
      name: 'Search Name',
      artists: [{ id: 1, name: 'Search Artist' }],
      album: { id: 1, name: 'Search Album', picUrl: 'search-cover' }
    })

    state.songList = [song]
    adapterMock.getSongDetail.mockResolvedValue(
      createMockSong({
        id: 'song-netease-search',
        platform: 'netease',
        name: 'Detail Name',
        artists: [{ id: 2, name: 'Detail Artist' }],
        album: { id: 3, name: 'Detail Album', picUrl: 'detail-cover' }
      })
    )
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/netease.mp3')
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    await actions.playSongWithDetails(0)

    expect(adapterMock.getSongDetail).toHaveBeenCalledWith('netease', 'song-netease-search')
    expect(song.name).toBe('Detail Name')
    expect(song.artists[0]?.name).toBe('Detail Artist')
    expect(song.album.picUrl).toBe('detail-cover')
    expect(song.url).toBe('https://song.test/netease.mp3')
    expect(state.currentSong?.name).toBe('Detail Name')
    expect(state.currentSong?.artists[0]?.name).toBe('Detail Artist')
    expect(state.currentSong?.album.picUrl).toBe('detail-cover')
  })

  it('tolerates incomplete playlist-track song objects before hydrating netease playback', async () => {
    const { actions, state } = createSubject()
    const rawPlaylistSong = {
      id: 'playlist-track-1',
      name: 'Playlist Track',
      platform: 'netease',
      originalId: 'playlist-track-1',
      duration: 0,
      mvid: 0
    } as unknown as Song

    state.songList = [rawPlaylistSong]
    adapterMock.getSongDetail.mockResolvedValue(
      createMockSong({
        id: 'playlist-track-1',
        platform: 'netease',
        name: 'Hydrated Playlist Track',
        artists: [{ id: 3, name: 'Hydrated Artist' }],
        album: { id: 9, name: 'Hydrated Album', picUrl: 'hydrated-cover' }
      })
    )
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/playlist-track.mp3')
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    await expect(actions.playSongWithDetails(0)).resolves.toBeUndefined()

    expect(adapterMock.getSongDetail).toHaveBeenCalledWith('netease', 'playlist-track-1')
    expect(rawPlaylistSong.url).toBe('https://song.test/playlist-track.mp3')
    expect(rawPlaylistSong.artists?.[0]?.name).toBe('Hydrated Artist')
    expect(rawPlaylistSong.album?.picUrl).toBe('hydrated-cover')
    expect(state.currentSong?.name).toBe('Hydrated Playlist Track')
  })

  it('reuses cached urls for netease songs during playback transitions', async () => {
    const { actions, state, playSongByIndex } = createSubject()
    const song = createMockSong({
      id: 'song-netease',
      platform: 'netease',
      url: 'https://stale.example.com/old.mp3',
      unavailable: true,
      errorMessage: 'stale',
      retryCount: 1
    })
    state.songList = [song]
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    await actions.playSongWithDetails(0)

    expect(adapterMock.getSongUrl).not.toHaveBeenCalled()
    expect(song.url).toBe('https://stale.example.com/old.mp3')
    expect(song.unavailable).toBe(false)
    expect(song.errorMessage).toBeNull()
    expect(song.retryCount).toBe(0)
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })

  it('restores the previous song state when a manual switch fails before playback starts', async () => {
    const { actions, state, playSongByIndex } = createSubject()
    const previousSong = createMockSong({
      id: 'song-prev',
      platform: 'qq',
      url: 'https://song.test/prev.mp3'
    })
    const nextSong = createMockSong({
      id: 'song-next',
      platform: 'qq',
      url: 'https://song.test/next.mp3'
    })

    state.songList = [previousSong, nextSong]
    state.currentIndex = 0
    state.currentSong = previousSong
    state.lyricSong = previousSong
    state.lyricsArray = [{ time: 0, text: 'previous lyric', trans: '', roma: '' }]
    state.currentLyricIndex = 0

    playSongByIndex.mockRejectedValueOnce(new Error('playback failed'))

    await expect(actions.playSongWithDetails(1, false)).rejects.toThrow('playback failed')

    expect(state.currentIndex).toBe(0)
    expect(state.currentSong).toBe(previousSong)
    expect(state.lyricSong).toBe(previousSong)
    expect(state.lyricsArray).toEqual([{ time: 0, text: 'previous lyric', trans: '', roma: '' }])
  })

  it('refreshes cached netease urls after an initial playback failure and retries once', async () => {
    const { actions, state, playSongByIndex } = createSubject()
    const song = createMockSong({
      id: 'song-netease-retry',
      platform: 'netease',
      url: 'https://stale.example.com/old.mp3'
    })

    state.songList = [song]
    playSongByIndex
      .mockRejectedValueOnce(new Error('stale cached url'))
      .mockResolvedValueOnce(undefined)
    adapterMock.getSongUrl.mockResolvedValue('https://song.test/fresh-retry.mp3')
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    await actions.playSongWithDetails(0)

    expect(adapterMock.getSongUrl).toHaveBeenCalledWith('netease', 'song-netease-retry', {
      mediaId: undefined
    })
    expect(song.url).toBe('https://song.test/fresh-retry.mp3')
    expect(playSongByIndex).toHaveBeenCalledTimes(2)
    expect(playSongByIndex).toHaveBeenNthCalledWith(1, 0)
    expect(playSongByIndex).toHaveBeenNthCalledWith(2, 0)
  })

  it('keeps current lyrics when lyric loading is cancelled', async () => {
    const { actions, state, setLyricsArray } = createSubject()
    state.songList = [createMockSong({ url: 'https://song.test/ready.mp3' })]
    adapterMock.getLyric.mockRejectedValue({ __cancel: true })

    await actions.playSongWithDetails(0)

    expect(isCanceledRequestErrorMock).toHaveBeenCalled()
    // setLyricsArray is called once to clear lyrics when song starts (playSongByIndex)
    // but not called again when lyric request is cancelled
    expect(setLyricsArray).toHaveBeenCalledTimes(1)
    expect(setLyricsArray).toHaveBeenCalledWith([])
  })

  it('ignores stale lyric responses from superseded playback requests', async () => {
    const { actions, state, setLyricsArray } = createSubject()
    state.songList = [
      createMockSong({ id: 'song-1', url: 'https://song.test/1.mp3' }),
      createMockSong({ id: 'song-2', url: 'https://song.test/2.mp3' })
    ]

    const firstLyric = createDeferred<{ lrc: string; tlyric: string; romalrc: string }>()
    const secondLyric = createDeferred<{ lrc: string; tlyric: string; romalrc: string }>()

    adapterMock.getLyric.mockImplementation((_: string, songId: string | number) => {
      return songId === 'song-1' ? firstLyric.promise : secondLyric.promise
    })

    // Reset lyricParseMock to ensure clean state
    lyricParseMock.mockClear()
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

    // Under the atomic switch flow the first request can be superseded before it commits.
    // Only the current song clears lyrics and then applies the fresh lyric payload.
    expect(setLyricsArray).toHaveBeenCalledTimes(2)
    // Verify the last call is with the new lyrics (not the old/stale ones)
    expect(setLyricsArray).toHaveBeenLastCalledWith([
      { time: 0, text: 'New line', trans: '', roma: '' }
    ])
    // Verify setLyricsArray was never called with the old/stale lyrics
    const callsWithOldLyrics = setLyricsArray.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as Array<{ text: string }>
      return arg.length > 0 && arg[0].text === 'Old line'
    })
    expect(callsWithOldLyrics).toHaveLength(0)
  })

  it('ignores stale playback requests before they can replace the current song', async () => {
    const { actions, state, playSongByIndex, onStateChange } = createSubject()
    state.songList = [
      createQQSong({ id: 'song-1', url: undefined }),
      createQQSong({ id: 'song-2', url: undefined })
    ]

    const firstUrl = createDeferred<string | null>()
    const secondUrl = createDeferred<string | null>()

    adapterMock.getSongUrl
      .mockImplementationOnce(() => firstUrl.promise)
      .mockImplementationOnce(() => secondUrl.promise)
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    const firstPlayback = actions.playSongWithDetails(0)
    const secondPlayback = actions.playSongWithDetails(1)

    secondUrl.resolve('https://song.test/2.mp3')
    await secondPlayback

    firstUrl.resolve('https://song.test/1.mp3')
    await firstPlayback

    expect(playSongByIndex).toHaveBeenCalledTimes(1)
    expect(playSongByIndex).toHaveBeenCalledWith(1)

    const switchedToFirstSong = onStateChange.mock.calls.some(
      ([changes]) => (changes as { currentSong?: Song | null }).currentSong?.id === 'song-1'
    )
    expect(switchedToFirstSong).toBe(false)
  })

  it('skips state updates when an older playback promise resolves after a newer switch', async () => {
    const { actions, state, playSongByIndex, onStateChange } = createSubject()
    state.songList = [
      createMockSong({ id: 'song-1', url: 'https://song.test/1.mp3' }),
      createMockSong({ id: 'song-2', url: 'https://song.test/2.mp3' })
    ]

    const firstPlaybackCommit = createDeferred<void>()
    const secondPlaybackCommit = createDeferred<void>()

    playSongByIndex.mockImplementation((index: number) => {
      return index === 0 ? firstPlaybackCommit.promise : secondPlaybackCommit.promise
    })
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    const firstPlayback = actions.playSongWithDetails(0)
    const secondPlayback = actions.playSongWithDetails(1)

    secondPlaybackCommit.resolve()
    await secondPlayback

    firstPlaybackCommit.resolve()
    await firstPlayback

    expect(state.currentSong?.id).toBe('song-2')
    expect(state.currentIndex).toBe(1)

    const switchedToFirstSong = onStateChange.mock.calls.some(
      ([changes]) => (changes as { currentSong?: Song | null }).currentSong?.id === 'song-1'
    )
    expect(switchedToFirstSong).toBe(false)
  })

  it('marks songs unavailable and rethrows when auto skip is disabled', async () => {
    const { actions, state, errorHandler } = createSubject()
    state.songList = [createQQSong({ id: 'vip-song' })]
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
    state.songList = [createMockSong({ id: 'bad-song' })]
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
