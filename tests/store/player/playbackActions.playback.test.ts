// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createDeferred } from '../../helpers/deferred'
import { createMockSong, createQQSong } from '../../utils/test-utils'
import {
  adapterMock,
  createSubject,
  isCanceledRequestErrorMock,
  lyricParseMock,
  resetPlaybackActionMocks
} from './playbackActions.helpers'

describe('playbackActions playback resolution', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('fetches song url, plays it, and parses lyrics', async () => {
    const { actions, state, setLyricsArray, playSongByIndex, onStateChange, onPlaybackCommitted } =
      createSubject()
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
    expect(onPlaybackCommitted).toHaveBeenCalledWith(song)
    expect(setLyricsArray).toHaveBeenCalledWith([
      { time: 0, text: 'main', trans: 'trans', roma: 'roma' }
    ])
    expect(onStateChange).toHaveBeenCalledWith({
      loading: true,
      progress: 0,
      duration: 0
    })
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
    } as const

    state.songList = [rawPlaylistSong as never]
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
    expect((rawPlaylistSong as { url?: string }).url).toBe('https://song.test/playlist-track.mp3')
    expect((rawPlaylistSong as { artists?: Array<{ name: string }> }).artists?.[0]?.name).toBe(
      'Hydrated Artist'
    )
    expect((rawPlaylistSong as { album?: { picUrl: string } }).album?.picUrl).toBe('hydrated-cover')
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

    expect(setLyricsArray).toHaveBeenCalledTimes(2)
    expect(setLyricsArray).toHaveBeenLastCalledWith([
      { time: 0, text: 'New line', trans: '', roma: '' }
    ])
    const callsWithOldLyrics = setLyricsArray.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as Array<{ text: string }>
      return arg.length > 0 && arg[0].text === 'Old line'
    })
    expect(callsWithOldLyrics).toHaveLength(0)
  })
})
