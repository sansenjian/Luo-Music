import { computed, ref } from 'vue'

import { services } from '@/services'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import {
  AUDIO_OUTPUT_STORAGE_KEY,
  DEFAULT_AUDIO_OUTPUT_STATE,
  createDefaultAudioOutputStatus,
  isAudioOutputStatus,
  sanitizeAudioOutputSettings,
  sanitizeAudioOutputState,
  type AudioOutputSettings,
  type AudioOutputState,
  type AudioOutputStatus,
  type AudioOutputTestTonePayload
} from '@shared/audioOutput/protocol'
import type { StorageService } from '@/services/storageService'

type AudioOutputMainBridge = {
  getStatus?(): Promise<AudioOutputStatus | void> | AudioOutputStatus | void
  setEnabled(
    enabled: boolean,
    settings: AudioOutputSettings
  ): Promise<AudioOutputStatus | void> | AudioOutputStatus | void
  updateSettings(
    settings: AudioOutputSettings
  ): Promise<AudioOutputStatus | void> | AudioOutputStatus | void
  playTestTone?(
    payload?: AudioOutputTestTonePayload
  ): Promise<AudioOutputStatus | void> | AudioOutputStatus | void
  subscribeStatus?(listener: (status: AudioOutputStatus) => void): (() => void) | void
}

export type AudioOutputSharedDevice = {
  id: string
  label: string
}

export type AudioOutputMediaDevices = Pick<MediaDevices, 'enumerateDevices'> &
  Partial<Pick<MediaDevices, 'addEventListener' | 'removeEventListener'>>

export type AudioOutputPluginDeps = {
  storageService?: Pick<StorageService, 'getJSON' | 'setJSON'>
  audioOutputMainBridge?: AudioOutputMainBridge | null
  mediaDevices?: AudioOutputMediaDevices | null
}

const audioOutputState = ref<AudioOutputState>({
  enabled: DEFAULT_AUDIO_OUTPUT_STATE.enabled,
  settings: { ...DEFAULT_AUDIO_OUTPUT_STATE.settings }
})
const audioOutputStatus = ref<AudioOutputStatus>(createDefaultAudioOutputStatus())
const sharedOutputDevices = ref<AudioOutputSharedDevice[]>([])

let isAudioOutputInitialized = false
let isAudioOutputStatusListenerRegistered = false
let isSharedOutputDeviceListenerRegistered = false

function getDefaultAudioOutputMainBridge(): AudioOutputMainBridge | null {
  if (typeof window === 'undefined') {
    return null
  }

  const servicesBridge = (
    window as Window & {
      services?: {
        invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
        on?: (channel: string, callback: (value: unknown) => void) => (() => void) | void
      }
    }
  ).services

  if (typeof servicesBridge?.invoke !== 'function') {
    return null
  }

  return {
    async getStatus(): Promise<AudioOutputStatus | void> {
      const result = await servicesBridge.invoke(INVOKE_CHANNELS.AUDIO_OUTPUT_GET_STATUS)
      if (isAudioOutputStatus(result)) {
        return result
      }
    },
    async setEnabled(
      enabled: boolean,
      settings: AudioOutputSettings
    ): Promise<AudioOutputStatus | void> {
      const result = await servicesBridge.invoke(
        INVOKE_CHANNELS.AUDIO_OUTPUT_SET_ENABLED,
        enabled,
        settings
      )
      if (isAudioOutputStatus(result)) {
        return result
      }
    },
    async updateSettings(settings: AudioOutputSettings): Promise<AudioOutputStatus | void> {
      const result = await servicesBridge.invoke(
        INVOKE_CHANNELS.AUDIO_OUTPUT_UPDATE_SETTINGS,
        settings
      )
      if (isAudioOutputStatus(result)) {
        return result
      }
    },
    async playTestTone(payload?: AudioOutputTestTonePayload): Promise<AudioOutputStatus | void> {
      const result = await servicesBridge.invoke(
        INVOKE_CHANNELS.AUDIO_OUTPUT_PLAY_TEST_TONE,
        payload
      )
      if (isAudioOutputStatus(result)) {
        return result
      }
    },
    subscribeStatus(listener: (status: AudioOutputStatus) => void): (() => void) | void {
      return servicesBridge.on?.(RECEIVE_CHANNELS.AUDIO_OUTPUT_STATUS_CHANGED, value => {
        if (isAudioOutputStatus(value)) {
          listener(value)
        }
      })
    }
  }
}

function getDefaultMediaDevices(): AudioOutputMediaDevices | null {
  if (typeof navigator === 'undefined') {
    return null
  }

  return navigator.mediaDevices ?? null
}

function normalizeSharedOutputDevices(
  devices: readonly MediaDeviceInfo[]
): AudioOutputSharedDevice[] {
  let fallbackIndex = 1

  return devices
    .filter(
      device => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default'
    )
    .map(device => {
      const label = device.label.trim() || `输出设备 ${fallbackIndex++}`
      return {
        id: device.deviceId,
        label
      }
    })
}

function createUnavailableStatus(state: AudioOutputState, reason: string): AudioOutputStatus {
  return {
    ...createDefaultAudioOutputStatus(),
    enabled: state.enabled,
    backend: state.enabled ? 'unavailable' : 'disabled',
    requestedMode: state.settings.mode,
    deviceId: state.settings.deviceId || undefined,
    reason
  }
}

function createSyncFailedStatus(state: AudioOutputState, error: unknown): AudioOutputStatus {
  return createUnavailableStatus(state, error instanceof Error ? error.message : String(error))
}

export function useAudioOutputPlugin(deps: AudioOutputPluginDeps = {}) {
  const storageService = deps.storageService ?? services.storage()
  const audioOutputMainBridge =
    deps.audioOutputMainBridge === undefined
      ? getDefaultAudioOutputMainBridge()
      : deps.audioOutputMainBridge
  const mediaDevices =
    deps.mediaDevices === undefined ? getDefaultMediaDevices() : deps.mediaDevices

  if (!isAudioOutputStatusListenerRegistered && audioOutputMainBridge?.subscribeStatus) {
    audioOutputMainBridge.subscribeStatus(status => {
      audioOutputStatus.value = status
    })
    isAudioOutputStatusListenerRegistered = true
  }

  if (!isAudioOutputInitialized) {
    audioOutputState.value = sanitizeAudioOutputState(
      storageService.getJSON<unknown>(AUDIO_OUTPUT_STORAGE_KEY)
    )
    isAudioOutputInitialized = true
    syncAudioOutputStatusFromMain()
    syncAudioOutputEnabledToMain(audioOutputState.value.enabled)
  }

  if (!isSharedOutputDeviceListenerRegistered && mediaDevices?.addEventListener) {
    mediaDevices.addEventListener('devicechange', () => {
      void refreshSharedOutputDevices()
    })
    isSharedOutputDeviceListenerRegistered = true
  }

  function persist(nextState: AudioOutputState): void {
    audioOutputState.value = {
      enabled: nextState.enabled,
      settings: { ...nextState.settings }
    }
    storageService.setJSON(AUDIO_OUTPUT_STORAGE_KEY, audioOutputState.value)
  }

  function syncAudioOutputStatusFromMain(): void {
    if (!audioOutputMainBridge?.getStatus) {
      return
    }

    void Promise.resolve(audioOutputMainBridge.getStatus())
      .then(status => {
        if (isAudioOutputStatus(status)) {
          audioOutputStatus.value = status
        }
      })
      .catch(error => {
        console.warn('[AudioOutput] Failed to fetch native audio output status', error)
      })
  }

  async function refreshSharedOutputDevices(): Promise<AudioOutputSharedDevice[]> {
    if (typeof mediaDevices?.enumerateDevices !== 'function') {
      sharedOutputDevices.value = []
      return []
    }

    try {
      const devices = normalizeSharedOutputDevices(await mediaDevices.enumerateDevices())
      sharedOutputDevices.value = devices
      return devices
    } catch (error) {
      sharedOutputDevices.value = []
      console.warn('[AudioOutput] Failed to enumerate Chromium output devices', error)
      return []
    }
  }

  function syncAudioOutputEnabledToMain(enabled: boolean): void {
    const nextState = {
      enabled,
      settings: audioOutputState.value.settings
    }

    if (!audioOutputMainBridge) {
      audioOutputStatus.value = createUnavailableStatus(
        nextState,
        'Native audio output service is unavailable in this runtime.'
      )
      return
    }

    audioOutputStatus.value = createUnavailableStatus(
      nextState,
      enabled ? 'Native audio output backend is starting.' : 'Native audio output is disabled.'
    )

    void Promise.resolve(audioOutputMainBridge.setEnabled(enabled, nextState.settings))
      .then(status => {
        if (isAudioOutputStatus(status)) {
          audioOutputStatus.value = status
        }
      })
      .catch(error => {
        audioOutputStatus.value = createSyncFailedStatus(nextState, error)
        console.warn('[AudioOutput] Failed to sync native audio output state', error)
      })
  }

  function syncAudioOutputSettingsToMain(settings: AudioOutputSettings): void {
    if (!audioOutputMainBridge) {
      audioOutputStatus.value = createUnavailableStatus(
        audioOutputState.value,
        'Native audio output service is unavailable in this runtime.'
      )
      return
    }

    void Promise.resolve(audioOutputMainBridge.updateSettings(settings))
      .then(status => {
        if (isAudioOutputStatus(status)) {
          audioOutputStatus.value = status
        }
      })
      .catch(error => {
        audioOutputStatus.value = createSyncFailedStatus(audioOutputState.value, error)
        console.warn('[AudioOutput] Failed to sync native audio output settings', error)
      })
  }

  function setAudioOutputEnabled(next: boolean): void {
    persist({
      ...audioOutputState.value,
      enabled: next
    })
    syncAudioOutputEnabledToMain(next)
  }

  function updateAudioOutputSettings(nextSettings: Record<string, unknown>): AudioOutputSettings {
    const settings = sanitizeAudioOutputSettings({
      ...audioOutputState.value.settings,
      ...nextSettings
    })

    persist({
      ...audioOutputState.value,
      settings
    })
    syncAudioOutputSettingsToMain(settings)
    return settings
  }

  async function playAudioOutputTestTone(
    payload?: AudioOutputTestTonePayload
  ): Promise<AudioOutputStatus> {
    const state = audioOutputState.value

    if (!audioOutputMainBridge?.playTestTone) {
      const status = createUnavailableStatus(
        state,
        'Native audio output service is unavailable in this runtime.'
      )
      audioOutputStatus.value = status
      return status
    }

    try {
      const status = await Promise.resolve(audioOutputMainBridge.playTestTone(payload))
      if (isAudioOutputStatus(status)) {
        audioOutputStatus.value = status
        return status
      }
    } catch (error) {
      const status = createSyncFailedStatus(state, error)
      audioOutputStatus.value = status
      console.warn('[AudioOutput] Failed to play native audio output test tone', error)
      return status
    }

    const status = createUnavailableStatus(
      state,
      'Native audio output service did not return a test tone status.'
    )
    audioOutputStatus.value = status
    return status
  }

  return {
    audioOutputState,
    audioOutputEnabled: computed(() => audioOutputState.value.enabled),
    audioOutputSettings: computed(() => audioOutputState.value.settings),
    audioOutputStatus: computed(() => audioOutputStatus.value),
    sharedOutputDevices: computed(() => sharedOutputDevices.value),
    refreshSharedOutputDevices,
    setAudioOutputEnabled,
    updateAudioOutputSettings,
    playAudioOutputTestTone
  }
}
