// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import type { Song } from '@/types/schemas'
import { createMockSong, createQQSong } from '../../utils/test-utils'
import {
  adapterMock,
  createSubject,
  lyricParseMock,
  resetPlaybackActionMocks
} from './playbackActions.helpers'

describe('playbackActions navigation concurrent', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
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

  it('ignores stale playback requests before they can replace the current song', async () => {
    const { actions, state, playSongByIndex, onStateChange } = createSubject()
    state.songList = [
      createQQSong({ id: 'song-1', url: undefined }),
      createQQSong({ id: 'song-2', url: undefined })
    ]

    const firstUrl = Promise.withResolvers<string | null>()
    const secondUrl = Promise.withResolvers<string | null>()

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

    const firstPlaybackCommit = Promise.withResolvers<void>()
    const secondPlaybackCommit = Promise.withResolvers<void>()

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
})
