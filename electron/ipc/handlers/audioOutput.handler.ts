import { ipcService } from '../IpcService'
import { INVOKE_CHANNELS } from '@shared/protocol/channels'
import {
  createDefaultAudioOutputStatus,
  sanitizeAudioOutputPlayFilePayload,
  sanitizeAudioOutputPlaybackVolumePayload,
  sanitizeAudioOutputSettings,
  sanitizeAudioOutputTestTonePayload,
  type AudioOutputPlayFilePayload,
  type AudioOutputPlaybackVolumePayload,
  type AudioOutputSettings,
  type AudioOutputStatus,
  type AudioOutputTestTonePayload
} from '@shared/audioOutput/protocol'
import type { AudioOutputService } from '../../main/audioOutputService'

type AudioOutputRuntime = Pick<
  AudioOutputService,
  | 'getStatus'
  | 'setEnabled'
  | 'updateSettings'
  | 'playTestTone'
  | 'probeExclusiveLock'
  | 'playFile'
  | 'pausePlayback'
  | 'resumePlayback'
  | 'stopPlayback'
  | 'stopPlaybackSettled'
  | 'setPlaybackVolume'
>

let audioOutputCommandQueue: Promise<void> = Promise.resolve()

function enqueueAudioOutputCommand<T>(command: () => T | Promise<T>): Promise<T> {
  const result = audioOutputCommandQueue.then(() => Promise.resolve(command()))
  audioOutputCommandQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function createUnavailableStatus(
  enabled: boolean,
  settings: AudioOutputSettings
): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled,
    backend: enabled ? 'unavailable' : 'disabled',
    settings: { ...settings },
    requestedMode: settings.mode,
    deviceId: settings.deviceId || undefined,
    reason: enabled ? 'Native audio output service is unavailable.' : undefined
  }
}

export function registerAudioOutputHandlers(nativeService?: AudioOutputRuntime): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS, async () => {
    return nativeService?.getStatus() ?? createDefaultAudioOutputStatus()
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_SET_ENABLED,
    async (enabled: boolean, settings: AudioOutputSettings) => {
      const sanitizedSettings = sanitizeAudioOutputSettings(settings)
      if (!nativeService) {
        return createUnavailableStatus(enabled, sanitizedSettings)
      }

      return enqueueAudioOutputCommand(() => nativeService.setEnabled(enabled, sanitizedSettings))
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_UPDATE_SETTINGS,
    async (settings: AudioOutputSettings) => {
      const sanitizedSettings = sanitizeAudioOutputSettings(settings)
      if (!nativeService) {
        return createUnavailableStatus(false, sanitizedSettings)
      }

      return enqueueAudioOutputCommand(() => nativeService.updateSettings(sanitizedSettings))
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_TEST_TONE,
    async (payload?: AudioOutputTestTonePayload) => {
      if (nativeService) {
        return enqueueAudioOutputCommand(() =>
          nativeService.playTestTone(sanitizeAudioOutputTestTonePayload(payload))
        )
      }

      return {
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'unavailable',
        reason: 'Native audio output service is unavailable.'
      } satisfies AudioOutputStatus
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_PROBE_EXCLUSIVE_LOCK, async () => {
    if (!nativeService) {
      return createDefaultAudioOutputStatus()
    }

    return enqueueAudioOutputCommand(() => nativeService.probeExclusiveLock())
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE,
    async (payload: AudioOutputPlayFilePayload) => {
      if (nativeService) {
        return enqueueAudioOutputCommand(() =>
          nativeService.playFile(sanitizeAudioOutputPlayFilePayload(payload))
        )
      }

      return {
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'unavailable',
        reason: 'Native audio output service is unavailable.'
      } satisfies AudioOutputStatus
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_PAUSE_PLAYBACK, async () => {
    if (!nativeService) {
      return createDefaultAudioOutputStatus()
    }

    return enqueueAudioOutputCommand(() => nativeService.pausePlayback())
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_RESUME_PLAYBACK, async () => {
    if (!nativeService) {
      return createDefaultAudioOutputStatus()
    }

    return enqueueAudioOutputCommand(() => nativeService.resumePlayback())
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_STOP_PLAYBACK, async () => {
    if (!nativeService) {
      return createDefaultAudioOutputStatus()
    }

    return enqueueAudioOutputCommand(() => nativeService.stopPlaybackSettled())
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME,
    async (payload: AudioOutputPlaybackVolumePayload) => {
      if (!nativeService) {
        return createDefaultAudioOutputStatus()
      }

      return enqueueAudioOutputCommand(() =>
        nativeService.setPlaybackVolume(sanitizeAudioOutputPlaybackVolumePayload(payload))
      )
    }
  )
}
