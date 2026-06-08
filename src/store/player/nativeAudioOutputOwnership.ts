import type { AudioOutputStatus } from '@shared/audioOutput/protocol'

export type NativeAudioOutputPlaybackState = AudioOutputStatus['nativePlaybackState']

export type PendingNativeAudioOutputIntent = {
  shouldPlayAfterStart: boolean
  shouldPauseAfterStart: boolean
  shouldResumeAfterPendingPause: boolean
}

export class NativeAudioOutputOwnership {
  active = false
  pendingStart = false
  pendingPlaybackIntent: boolean | null = null
  pausedDuringPendingStart = false
  wasPlayingFromHelper = false
  progressClockSuspended = false
  lastState: NativeAudioOutputPlaybackState = 'idle'
  lastLyricSyncMs = 0

  isClaimed(): boolean {
    return this.active || this.pendingStart
  }

  resetRuntimeState(): void {
    this.wasPlayingFromHelper = false
    this.progressClockSuspended = false
    this.pendingStart = false
    this.pendingPlaybackIntent = null
    this.pausedDuringPendingStart = false
    this.lastState = 'idle'
    this.lastLyricSyncMs = 0
  }

  release(): void {
    this.active = false
    this.resetRuntimeState()
  }

  beginPendingStart(intent = true): void {
    this.pendingStart = true
    this.pendingPlaybackIntent = intent
  }

  suspendProgressClock(): void {
    this.progressClockSuspended = true
  }

  markHelperPlaying(): void {
    this.active = true
    this.pendingStart = false
    this.wasPlayingFromHelper = true
    this.progressClockSuspended = false
  }

  markPausedDuringPendingStart(): void {
    this.pausedDuringPendingStart = true
    this.wasPlayingFromHelper = false
  }

  markStarting(): void {
    this.active = true
    this.lastState = 'starting'
    this.wasPlayingFromHelper = false
    this.progressClockSuspended = true
    this.pendingStart = false
  }

  beginSeekStart(): void {
    this.wasPlayingFromHelper = false
    this.progressClockSuspended = true
    this.lastState = 'starting'
    this.pendingStart = true
  }

  consumePendingIntent(): PendingNativeAudioOutputIntent {
    const shouldPlayAfterStart = this.pendingPlaybackIntent !== false
    const shouldPauseAfterStart = !shouldPlayAfterStart && !this.pausedDuringPendingStart
    const shouldResumeAfterPendingPause = shouldPlayAfterStart && this.pausedDuringPendingStart

    this.pendingPlaybackIntent = null
    this.pausedDuringPendingStart = false

    return {
      shouldPlayAfterStart,
      shouldPauseAfterStart,
      shouldResumeAfterPendingPause
    }
  }
}

export function createNativeAudioOutputOwnership(): NativeAudioOutputOwnership {
  return new NativeAudioOutputOwnership()
}
