// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createMockSong } from '../../utils/test-utils'
import {
  adapterMock,
  createSubject,
  lyricParseMock,
  resetPlaybackActionMocks
} from './playbackActions.helpers'

describe('playbackActions navigation state', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
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
      currentLyricIndex: 12,
      progress: 0,
      duration: 0
    })
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })

  it('clears stale progress and duration when switching to a different song', async () => {
    const { actions, state, onStateChange } = createSubject()
    const currentSong = createMockSong({ id: 'song-1', url: 'https://song.test/1.mp3' })
    const nextSong = createMockSong({ id: 'song-2', url: 'https://song.test/2.mp3' })

    state.songList = [currentSong, nextSong]
    state.currentSong = currentSong
    state.currentIndex = 0
    state.progress = 88
    state.duration = 233
    adapterMock.getLyric.mockResolvedValue({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
    lyricParseMock.mockReturnValue([])

    await actions.playSongWithDetails(1)

    expect(onStateChange).toHaveBeenCalledWith({
      loading: true,
      progress: 0,
      duration: 0
    })
    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 1,
      currentSong: nextSong,
      currentLyricIndex: -1,
      progress: 0,
      duration: 180
    })
  })

  it('throws when playSongByIndex is asked to play a song without a url', async () => {
    const { actions, state } = createSubject()
    state.songList = [createMockSong()]

    await expect(actions.playSongByIndex(0)).rejects.toThrow('No URL for song')
  })
})
