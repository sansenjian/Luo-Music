// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAY_MODE } from '@shared/player/playMode'
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

  it('uses the pending navigation target when next is triggered repeatedly', () => {
    const { actions, state } = createSubject()
    state.songList = [
      createMockSong({ id: 1 }),
      createMockSong({ id: 2 }),
      createMockSong({ id: 3 }),
      createMockSong({ id: 4 })
    ]
    state.currentIndex = 0

    const playSongWithDetails = vi
      .spyOn(actions, 'playSongWithDetails')
      .mockResolvedValue(undefined)

    actions.playNext()
    actions.playNext()

    expect(playSongWithDetails).toHaveBeenNthCalledWith(1, 1)
    expect(playSongWithDetails).toHaveBeenNthCalledWith(2, 2)
  })
})
