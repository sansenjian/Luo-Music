// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { createSubject, resetPlaybackActionMocks } from './playbackActions.helpers'

describe('playbackActions random index empty list', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('returns -1 for an empty playlist', () => {
    const { actions } = createSubject()

    expect(actions.getRandomIndex()).toBe(-1)
  })
})
