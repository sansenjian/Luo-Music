import { describe, expect, it } from 'vitest'

import { createNativeAudioOutputOwnership } from '@/store/player/nativeAudioOutputOwnership'

describe('NativeAudioOutputOwnership', () => {
  it('claims playback during pending native startup and releases cleanly', () => {
    const ownership = createNativeAudioOutputOwnership()

    expect(ownership.isClaimed()).toBe(false)

    ownership.beginPendingStart()

    expect(ownership.isClaimed()).toBe(true)
    expect(ownership.active).toBe(false)
    expect(ownership.pendingPlaybackIntent).toBe(true)

    ownership.markStarting()

    expect(ownership.isClaimed()).toBe(true)
    expect(ownership.active).toBe(true)
    expect(ownership.pendingStart).toBe(false)
    expect(ownership.lastState).toBe('starting')

    ownership.release()

    expect(ownership.isClaimed()).toBe(false)
    expect(ownership.lastState).toBe('idle')
  })

  it('preserves an explicit pause intent through startup completion', () => {
    const ownership = createNativeAudioOutputOwnership()

    ownership.beginPendingStart(true)
    ownership.pendingPlaybackIntent = false
    ownership.markPausedDuringPendingStart()

    expect(ownership.consumePendingIntent()).toStrictEqual({
      shouldPlayAfterStart: false,
      shouldPauseAfterStart: false,
      shouldResumeAfterPendingPause: false
    })
    expect(ownership.pendingPlaybackIntent).toBeNull()
    expect(ownership.pausedDuringPendingStart).toBe(false)
  })

  it('resumes when play follows an early pending-start pause', () => {
    const ownership = createNativeAudioOutputOwnership()

    ownership.beginPendingStart(true)
    ownership.pendingPlaybackIntent = false
    ownership.markPausedDuringPendingStart()
    ownership.pendingPlaybackIntent = true

    expect(ownership.consumePendingIntent()).toStrictEqual({
      shouldPlayAfterStart: true,
      shouldPauseAfterStart: false,
      shouldResumeAfterPendingPause: true
    })
  })
})
