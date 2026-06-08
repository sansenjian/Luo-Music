// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createMockSong } from '../../utils/test-utils'
import { adapterMock, createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

describe('playbackActions playSongByIndex', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('plays an already-resolved song by index', async () => {
    const { actions, state, onStateChange, playSongByIndex } = createSubject()
    state.songList = [createMockSong({ url: 'https://song.test/1.mp3' })]

    await actions.playSongByIndex(0)

    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 0,
      currentSong: state.songList[0],
      currentLyricIndex: -1,
      progress: 0,
      duration: 180
    })
    expect(playSongByIndex).toHaveBeenCalledWith(0, state.songList[0])
  })

  it('resolves local library songs from localFilePath without loading a platform adapter', async () => {
    const { actions, state, playSongByIndex } = createSubject()
    const song = createMockSong({
      id: 'local:track-1',
      platform: 'local',
      originalId: 'local:track-1',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\local.mp3',
        localDurationKnown: true
      }
    })
    state.songList = [song]

    await actions.playSongByIndex(0)

    expect(adapterMock.getSongUrl).not.toHaveBeenCalled()
    expect(adapterMock.getSongDetail).not.toHaveBeenCalled()
    expect(adapterMock.getLyric).not.toHaveBeenCalled()
    expect(song.url).toBe('luo-media://media?path=D%3A%5CMusic%5Clocal.mp3')
    expect(playSongByIndex).toHaveBeenCalledWith(0, song)
  })

  it('keeps same-song progress changes committed during startup playback', async () => {
    const { actions, state, onStateChange, playSongByIndex } = createSubject()
    const song = createMockSong({ url: 'https://song.test/1.mp3' })
    state.songList = [song]
    state.currentSong = song
    state.currentIndex = 0
    state.progress = 177
    state.duration = 180
    playSongByIndex.mockImplementationOnce(async () => {
      state.progress = 0
    })

    await actions.playSongByIndex(0)

    expect(onStateChange).toHaveBeenCalledWith({
      currentIndex: 0,
      currentSong: song,
      currentLyricIndex: -1,
      progress: 0,
      duration: 180
    })
  })
})
