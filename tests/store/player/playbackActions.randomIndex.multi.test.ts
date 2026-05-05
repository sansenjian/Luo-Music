// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockSong } from '../../utils/test-utils'
import { createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

describe('playbackActions random index multi-song', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('avoids returning the current index when excludeCurrent is enabled', () => {
    const { actions, state } = createSubject()
    state.songList = [createMockSong({ id: 1 }), createMockSong({ id: 2 })]
    state.currentIndex = 0
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.75)

    expect(actions.getRandomIndex()).toBe(1)
  })
})
