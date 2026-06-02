import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import { isAudioOutputStatus, type AudioOutputStatus } from '@shared/audioOutput/protocol'
import { isLocalLibrarySong } from '@shared/types/localLibrary'
import type { Song } from '@shared/types/schemas'

export type NativeAudioOutputPlaybackRequest = {
  song: Song
  startSeconds?: number
  volume: number
}

export type NativeAudioOutputPlaybackController = {
  canPlay(request: NativeAudioOutputPlaybackRequest): boolean
  play(request: NativeAudioOutputPlaybackRequest): Promise<boolean>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  setVolume(volume: number): Promise<void>
  onEnded(listener: () => void): () => void
  onError(listener: () => void): () => void
}

type AudioOutputServiceBridge = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
  on?: (channel: string, callback: (value: unknown) => void) => (() => void) | void
}

const NATIVE_PLAYABLE_LOCAL_AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.wav'
])

function getServicesBridge(): AudioOutputServiceBridge | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (
    (
      window as Window & {
        services?: AudioOutputServiceBridge
      }
    ).services ?? null
  )
}

function resolveNativePlayableLocalFilePath(song: Song): string | null {
  if (!isLocalLibrarySong(song)) {
    return null
  }

  const localFilePath = (song.extra as Record<string, unknown> | undefined)?.localFilePath
  if (typeof localFilePath !== 'string' || !localFilePath.trim()) {
    return null
  }

  const trimmedPath = localFilePath.trim()
  const normalizedPath = trimmedPath.toLocaleLowerCase()
  for (const extension of NATIVE_PLAYABLE_LOCAL_AUDIO_EXTENSIONS) {
    if (normalizedPath.endsWith(extension)) {
      return trimmedPath
    }
  }

  return null
}

function isNativePlayableStatus(status: AudioOutputStatus): boolean {
  return (
    status.enabled &&
    status.backend === 'native' &&
    status.backendAvailable &&
    (status.requestedMode === 'shared' || status.requestedMode === 'exclusive')
  )
}

class DisabledNativeAudioOutputPlaybackController implements NativeAudioOutputPlaybackController {
  canPlay(): boolean {
    return false
  }

  async play(): Promise<boolean> {
    return false
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}

  async stop(): Promise<void> {}

  async setVolume(): Promise<void> {}

  onEnded(): () => void {
    return () => {}
  }

  onError(): () => void {
    return () => {}
  }
}

class IpcNativeAudioOutputPlaybackController implements NativeAudioOutputPlaybackController {
  private status: AudioOutputStatus | null = null
  private currentSource: string | null = null
  private readonly endedListeners = new Set<() => void>()
  private readonly errorListeners = new Set<() => void>()

  constructor(private readonly bridge: AudioOutputServiceBridge) {
    void this.refreshStatus()
    bridge.on?.(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED, value => {
      if (!isAudioOutputStatus(value)) {
        return
      }

      const previousState = this.status?.nativePlaybackState
      this.status = value
      if (value.nativePlaybackSource) {
        this.currentSource = value.nativePlaybackSource
      }

      if (previousState !== 'ended' && value.nativePlaybackState === 'ended') {
        for (const listener of this.endedListeners) {
          listener()
        }
      }

      if (previousState !== 'error' && value.nativePlaybackState === 'error') {
        for (const listener of this.errorListeners) {
          listener()
        }
      }
    })
  }

  canPlay(request: NativeAudioOutputPlaybackRequest): boolean {
    if (!this.bridge.invoke || !resolveNativePlayableLocalFilePath(request.song)) {
      return false
    }

    return Boolean(this.status && isNativePlayableStatus(this.status))
  }

  async play(request: NativeAudioOutputPlaybackRequest): Promise<boolean> {
    const path = resolveNativePlayableLocalFilePath(request.song)
    if (!this.bridge.invoke || !path) {
      return false
    }

    const status = await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE, {
      path,
      startSeconds: request.startSeconds,
      volume: request.volume
    })
    this.status = status
    this.currentSource = path
    return isNativePlayableStatus(status)
  }

  async pause(): Promise<void> {
    await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_PAUSE_PLAYBACK)
  }

  async resume(): Promise<void> {
    await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_RESUME_PLAYBACK)
  }

  async stop(): Promise<void> {
    this.currentSource = null
    await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_STOP_PLAYBACK)
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.currentSource) {
      return
    }

    await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME, { volume })
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener)
    return () => {
      this.endedListeners.delete(listener)
    }
  }

  onError(listener: () => void): () => void {
    this.errorListeners.add(listener)
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  private async refreshStatus(): Promise<void> {
    try {
      this.status = await this.invokeStatus(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS)
    } catch {
      this.status = null
    }
  }

  private async invokeStatus(channel: string, ...args: unknown[]): Promise<AudioOutputStatus> {
    if (!this.bridge.invoke) {
      throw new Error('Native audio output bridge is unavailable.')
    }

    const result = await this.bridge.invoke(channel, ...args)
    if (isAudioOutputStatus(result)) {
      return result
    }

    throw new Error('Native audio output service returned an invalid status.')
  }
}

let defaultController: NativeAudioOutputPlaybackController | null = null

export function getDefaultNativeAudioOutputPlaybackController(): NativeAudioOutputPlaybackController {
  if (defaultController) {
    return defaultController
  }

  const bridge = getServicesBridge()
  defaultController = bridge?.invoke
    ? new IpcNativeAudioOutputPlaybackController(bridge)
    : new DisabledNativeAudioOutputPlaybackController()

  return defaultController
}
