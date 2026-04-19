// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createMockSong } from '../../utils/test-utils'
import { createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

describe('playbackActions random index single song', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('returns 0 for a single-song playlist', () => {
    const { actions, state } = createSubject()
    state.songList = [createMockSong()]

    expect(actions.getRandomIndex()).toBe(0)
  })
})
