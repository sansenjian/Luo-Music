// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createMockSong } from '../../utils/test-utils'
import { createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

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
    expect(playSongByIndex).toHaveBeenCalledWith(0)
  })
})
