import { watch, type ComputedRef } from 'vue'

import {
  useAudioOutputPlugin,
  type AudioOutputSharedDevice
} from '@/composables/useAudioOutputPlugin'
import { services } from '@/services'
import type { PlatformService } from '@/services/platformService'
import { playerCore } from '@/utils/player/core/playerCore'
import type { AudioOutputSettings, AudioOutputStatus } from '@shared/audioOutput/protocol'

type AudioOutputPluginState = {
  audioOutputEnabled: ComputedRef<boolean> | { readonly value: boolean }
  audioOutputSettings: ComputedRef<AudioOutputSettings> | { readonly value: AudioOutputSettings }
  audioOutputStatus: ComputedRef<AudioOutputStatus> | { readonly value: AudioOutputStatus }
  sharedOutputDevices?:
    | ComputedRef<AudioOutputSharedDevice[]>
    | {
        readonly value: AudioOutputSharedDevice[]
      }
  refreshSharedOutputDevices?: () => void
}

type AudioOutputPlayer = {
  setOutputDevice(deviceId: string): Promise<void> | void
}

type AudioOutputPlaybackState = {
  enabled: boolean
  settings: AudioOutputSettings
  status: AudioOutputStatus
}

export type AudioOutputPlaybackSyncDeps = {
  platformService?: Pick<PlatformService, 'isElectron'>
  audioOutputPlugin?: AudioOutputPluginState
  player?: AudioOutputPlayer
  logger?: Pick<Console, 'warn'>
}

function resolveChromiumOutputDeviceId(state: AudioOutputPlaybackState): string {
  if (!state.enabled) {
    return ''
  }

  return state.settings.sharedDeviceId
}

export function useAudioOutputPlaybackSync(deps: AudioOutputPlaybackSyncDeps = {}): void {
  const platformService = deps.platformService ?? services.platform()

  if (!platformService.isElectron()) {
    return
  }

  const audioOutputPlugin = deps.audioOutputPlugin ?? useAudioOutputPlugin()
  const player = deps.player ?? playerCore
  const logger = deps.logger ?? console
  let syncRequestId = 0

  audioOutputPlugin.refreshSharedOutputDevices?.()

  watch(
    () => {
      const settings = audioOutputPlugin.audioOutputSettings.value
      const status = audioOutputPlugin.audioOutputStatus.value
      return {
        enabled: audioOutputPlugin.audioOutputEnabled.value,
        settings,
        status
      }
    },
    state => {
      const nextDeviceId = resolveChromiumOutputDeviceId({
        enabled: state.enabled,
        settings: state.settings,
        status: state.status
      })
      const requestId = ++syncRequestId

      void Promise.resolve(player.setOutputDevice(nextDeviceId)).catch(error => {
        if (requestId !== syncRequestId) {
          return
        }

        logger.warn('[AudioOutput] Failed to sync Chromium shared output device', error)
      })
    },
    { immediate: true }
  )
}
