// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockSong, createQQSong } from '../../utils/test-utils'
import {
  adapterMock,
  createSubject,
  errorEmitMock,
  noCopyrightMock,
  resetPlaybackActionMocks
} from './playbackActions.helpers'

describe('playbackActions recovery and skip flow', () => {
  beforeEach(() => {
    resetPlaybackActionMocks()
  })

  it('marks songs unavailable and rethrows when auto skip is disabled', async () => {
    const { actions, state, errorHandler } = createSubject()
    state.songList = [createQQSong({ id: 'vip-song' })]
    adapterMock.getSongUrl.mockResolvedValue(null)

    await expect(actions.playSongWithDetails(0, false)).rejects.toThrow()

    expect(noCopyrightMock).toHaveBeenCalledWith('vip-song')
    expect(errorEmitMock).toHaveBeenCalled()
    expect(errorHandler.markAsUnavailable).toHaveBeenCalledWith(
      state.songList[0],
      'No copyright for vip-song'
    )
  })

  it('auto skips to the next available song after playback errors', async () => {
    const { actions, state } = createSubject()
    state.songList = [createMockSong({ id: 'bad-song' })]
    adapterMock.getSongUrl.mockRejectedValue(new Error('network'))
    const playNextSkipUnavailable = vi
      .spyOn(actions, 'playNextSkipUnavailable')
      .mockResolvedValue(undefined)

    await expect(actions.playSongWithDetails(0)).resolves.toBeUndefined()
    expect(playNextSkipUnavailable).toHaveBeenCalled()
  })

  it('delegates playNextSkipUnavailable to the error handler callback', async () => {
    const { actions, errorHandler } = createSubject()
    const playSongWithDetails = vi
      .spyOn(actions, 'playSongWithDetails')
      .mockResolvedValue(undefined)

    errorHandler.playNextSkipUnavailable.mockImplementation(
      async (runner: (index: number) => Promise<void>) => {
        await runner(2)
      }
    )

    await actions.playNextSkipUnavailable()

    expect(errorHandler.playNextSkipUnavailable).toHaveBeenCalled()
    expect(playSongWithDetails).toHaveBeenCalledWith(2, false)
  })
})
