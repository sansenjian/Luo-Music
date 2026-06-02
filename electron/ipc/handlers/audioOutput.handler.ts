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
  | 'playFile'
  | 'pausePlayback'
  | 'resumePlayback'
  | 'stopPlayback'
  | 'setPlaybackVolume'
>

function createUnavailableStatus(
  enabled: boolean,
  settings: AudioOutputSettings
): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled,
    backend: enabled ? 'unavailable' : 'disabled',
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
      return (
        nativeService?.setEnabled(enabled, sanitizedSettings) ??
        createUnavailableStatus(enabled, sanitizedSettings)
      )
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_UPDATE_SETTINGS,
    async (settings: AudioOutputSettings) => {
      const sanitizedSettings = sanitizeAudioOutputSettings(settings)
      return (
        nativeService?.updateSettings(sanitizedSettings) ??
        createUnavailableStatus(false, sanitizedSettings)
      )
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_TEST_TONE,
    async (payload?: AudioOutputTestTonePayload) => {
      if (nativeService) {
        return nativeService.playTestTone(sanitizeAudioOutputTestTonePayload(payload))
      }

      return {
        ...createDefaultAudioOutputStatus(),
        enabled: true,
        backend: 'unavailable',
        reason: 'Native audio output service is unavailable.'
      } satisfies AudioOutputStatus
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_FILE,
    async (payload: AudioOutputPlayFilePayload) => {
      if (nativeService) {
        return nativeService.playFile(sanitizeAudioOutputPlayFilePayload(payload))
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
    return nativeService?.pausePlayback() ?? createDefaultAudioOutputStatus()
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_RESUME_PLAYBACK, async () => {
    return nativeService?.resumePlayback() ?? createDefaultAudioOutputStatus()
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.AUDIO_OUTPUT_STOP_PLAYBACK, async () => {
    return nativeService?.stopPlayback() ?? createDefaultAudioOutputStatus()
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.AUDIO_OUTPUT_SET_PLAYBACK_VOLUME,
    async (payload: AudioOutputPlaybackVolumePayload) => {
      return (
        nativeService?.setPlaybackVolume(sanitizeAudioOutputPlaybackVolumePayload(payload)) ??
        createDefaultAudioOutputStatus()
      )
    }
  )
}
