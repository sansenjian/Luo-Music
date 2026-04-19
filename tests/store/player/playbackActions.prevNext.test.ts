// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { createMockSong } from '../../utils/test-utils'
import { createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

describe('playbackActions prev/next', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
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
})
