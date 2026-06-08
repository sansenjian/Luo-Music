import { watch, type ComputedRef } from 'vue'

import {
  useAudioOutputPlugin,
  type AudioOutputSharedDevice
} from '@/composables/useAudioOutputPlugin'
import { services } from '@/services'
import type { PlatformService } from '@/services/platformService'
import { usePlayerStore } from '@/store/playerStore'
import { playerCore } from '@/utils/player/core/playerCore'
import type {
  AudioOutputMode,
  AudioOutputSettings,
  AudioOutputStatus,
  AudioOutputVoicemeeterBus,
  AudioOutputVoicemeeterHardwareOutBus,
  AudioOutputVoicemeeterHardwareOutDriver
} from '@shared/audioOutput/protocol'

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

type AudioOutputPlayerStore = {
  restartPlaybackForAudioOutputChange(): Promise<void>
}

type AudioOutputPlaybackState = {
  enabled: boolean
  settings: AudioOutputSettings
}

type NativePlaybackIdentity = {
  source?: string
  token?: string
}

export type AudioOutputPlaybackSyncDeps = {
  platformService?: Pick<PlatformService, 'isElectron'>
  audioOutputPlugin?: AudioOutputPluginState
  player?: AudioOutputPlayer
  playerStore?: AudioOutputPlayerStore
  logger?: Pick<Console, 'warn'>
}

function resolveChromiumOutputDeviceId(state: AudioOutputPlaybackState): string {
  if (!state.enabled) {
    return ''
  }

  return state.settings.sharedDeviceId
}

function parseVoicemeeterBus(value: unknown): AudioOutputVoicemeeterBus | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  return ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].includes(normalized)
    ? (normalized as AudioOutputVoicemeeterBus)
    : null
}

function normalizeVoicemeeterBus(value: unknown): AudioOutputVoicemeeterBus {
  return parseVoicemeeterBus(value) ?? 'A1'
}

function normalizeVoicemeeterHardwareOutBus(value: unknown): AudioOutputVoicemeeterHardwareOutBus {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  return ['A1', 'A2', 'A3'].includes(normalized)
    ? (normalized as AudioOutputVoicemeeterHardwareOutBus)
    : 'A1'
}

function normalizeVoicemeeterHardwareOutDriver(
  value: unknown
): AudioOutputVoicemeeterHardwareOutDriver {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  return ['wdm', 'mme', 'ks', 'asio'].includes(normalized)
    ? (normalized as AudioOutputVoicemeeterHardwareOutDriver)
    : 'wdm'
}

function isVoicemeeterRouteReady(status: AudioOutputStatus): boolean {
  const remote = status.voicemeeterRemote
  if (
    status.requestedMode !== 'voicemeeter' ||
    status.activeMode !== 'voicemeeter' ||
    remote?.available !== true ||
    remote.connected !== true ||
    remote.routeApplied !== true ||
    remote.routeManaged !== true ||
    parseVoicemeeterBus(remote.routeBus) !== normalizeVoicemeeterBus(status.settings.voicemeeterBus)
  ) {
    return false
  }

  const hardwareOutDevice = status.settings.voicemeeterHardwareOutDevice?.trim()
  if (!hardwareOutDevice) {
    return true
  }

  return (
    remote.hardwareOutApplied === true &&
    normalizeVoicemeeterHardwareOutBus(remote.hardwareOutBus) ===
      normalizeVoicemeeterHardwareOutBus(status.settings.voicemeeterHardwareOutBus) &&
    normalizeVoicemeeterHardwareOutDriver(remote.hardwareOutDriver) ===
      normalizeVoicemeeterHardwareOutDriver(status.settings.voicemeeterHardwareOutDriver) &&
    remote.hardwareOutDevice?.trim() === hardwareOutDevice
  )
}

function resolveNativeRouteKey(enabled: boolean, status: AudioOutputStatus): string | null {
  if (!enabled || !status.enabled || status.backend === 'disabled') {
    return 'chromium'
  }

  if (status.backend === 'unavailable') {
    return status.helperRunning === true ? null : 'chromium'
  }

  if (status.backend !== 'native' || status.backendAvailable !== true) {
    return 'chromium'
  }

  const mode: AudioOutputMode = status.requestedMode
  if (mode !== 'shared' && mode !== 'exclusive' && mode !== 'voicemeeter') {
    return 'chromium'
  }

  if (mode === 'voicemeeter' && !isVoicemeeterRouteReady(status)) {
    return null
  }

  return [
    mode,
    status.deviceId ?? '',
    status.settings.bufferFrames,
    status.settings.fallbackToShared,
    status.settings.bitPerfectRequired,
    status.settings.voicemeeterBus,
    status.settings.voicemeeterHardwareOutBus ?? '',
    status.settings.voicemeeterHardwareOutDriver ?? '',
    status.settings.voicemeeterHardwareOutDevice ?? ''
  ].join('|')
}

function resolveVoicemeeterNativePlaybackIdentity(
  status: AudioOutputStatus
): NativePlaybackIdentity | null {
  if (
    status.requestedMode !== 'voicemeeter' ||
    status.nativePlaybackRunning !== true ||
    (status.nativePlaybackState !== 'starting' &&
      status.nativePlaybackState !== 'playing' &&
      status.nativePlaybackState !== 'paused')
  ) {
    return null
  }

  const source = status.nativePlaybackSource?.trim()
  const token = status.nativePlaybackToken?.trim()
  if (!source && !token) {
    return null
  }

  return {
    ...(source ? { source } : {}),
    ...(token ? { token } : {})
  }
}

function isSameNativePlaybackIdentity(
  a: NativePlaybackIdentity | null,
  b: NativePlaybackIdentity | null
): boolean {
  if (!a || !b) {
    return false
  }

  if (a.token && b.token) {
    return a.token === b.token
  }

  return Boolean(a.source && b.source && a.source === b.source)
}

function isVoicemeeterPendingPlaybackAlreadyClaimed(
  status: AudioOutputStatus,
  pendingIdentity: NativePlaybackIdentity | null
): boolean {
  return isSameNativePlaybackIdentity(
    resolveVoicemeeterNativePlaybackIdentity(status),
    pendingIdentity
  )
}

export function useAudioOutputPlaybackSync(deps: AudioOutputPlaybackSyncDeps = {}): void {
  const platformService = deps.platformService ?? services.platform()

  if (!platformService.isElectron()) {
    return
  }

  const audioOutputPlugin = deps.audioOutputPlugin ?? useAudioOutputPlugin()
  const player = deps.player ?? playerCore
  const playerStore = deps.playerStore ?? usePlayerStore()
  const logger = deps.logger ?? console
  let syncRequestId = 0
  let routeSyncRequestId = 0
  let routeRestartRunning = false
  let routeRestartQueued = false
  let previousDeviceId: string | null = null
  let previousNativeRouteKey: string | null = null
  let pendingVoicemeeterRoutePlaybackIdentity: NativePlaybackIdentity | null = null

  audioOutputPlugin.refreshSharedOutputDevices?.()

  const drainNativeRouteRestartQueue = async (): Promise<void> => {
    if (routeRestartRunning) {
      return
    }

    routeRestartRunning = true
    try {
      while (routeRestartQueued) {
        routeRestartQueued = false
        const requestId = routeSyncRequestId
        try {
          await playerStore.restartPlaybackForAudioOutputChange()
        } catch (error) {
          if (requestId !== routeSyncRequestId || routeRestartQueued) {
            continue
          }

          logger.warn('[AudioOutput] Failed to restart playback after native output changed', error)
        }
      }
    } finally {
      routeRestartRunning = false
      if (routeRestartQueued) {
        void drainNativeRouteRestartQueue()
      }
    }
  }

  const queueNativeRouteRestart = (): void => {
    routeSyncRequestId += 1
    routeRestartQueued = true
    void drainNativeRouteRestartQueue()
  }

  watch(
    () => {
      const settings = audioOutputPlugin.audioOutputSettings.value
      return {
        enabled: audioOutputPlugin.audioOutputEnabled.value,
        settings
      }
    },
    state => {
      const nextDeviceId = resolveChromiumOutputDeviceId(state)
      if (nextDeviceId === previousDeviceId) {
        return
      }

      previousDeviceId = nextDeviceId
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

  watch(
    () => ({
      enabled: audioOutputPlugin.audioOutputEnabled.value,
      status: audioOutputPlugin.audioOutputStatus.value
    }),
    state => {
      const nextRouteKey = resolveNativeRouteKey(state.enabled, state.status)
      if (nextRouteKey === null) {
        pendingVoicemeeterRoutePlaybackIdentity = resolveVoicemeeterNativePlaybackIdentity(
          state.status
        )
        return
      }

      if (nextRouteKey === previousNativeRouteKey) {
        pendingVoicemeeterRoutePlaybackIdentity = null
        return
      }

      const shouldRestartPlayback =
        previousNativeRouteKey !== null &&
        !isVoicemeeterPendingPlaybackAlreadyClaimed(
          state.status,
          pendingVoicemeeterRoutePlaybackIdentity
        )
      previousNativeRouteKey = nextRouteKey
      pendingVoicemeeterRoutePlaybackIdentity = null
      if (!shouldRestartPlayback) {
        return
      }

      queueNativeRouteRestart()
    },
    { immediate: true }
  )
}
