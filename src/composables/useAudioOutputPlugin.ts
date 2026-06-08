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
let audioOutputStatusRequestId = 0

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
      const sanitizedSettings = cloneAudioOutputSettings(settings)
      const result = await servicesBridge.invoke(
        INVOKE_CHANNELS.AUDIO_OUTPUT_SET_ENABLED,
        enabled,
        sanitizedSettings
      )
      if (isAudioOutputStatus(result)) {
        return result
      }
    },
    async updateSettings(settings: AudioOutputSettings): Promise<AudioOutputStatus | void> {
      const sanitizedSettings = cloneAudioOutputSettings(settings)
      const result = await servicesBridge.invoke(
        INVOKE_CHANNELS.AUDIO_OUTPUT_UPDATE_SETTINGS,
        sanitizedSettings
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

function cloneAudioOutputSettings(settings: AudioOutputSettings): AudioOutputSettings {
  return sanitizeAudioOutputSettings(settings)
}

const VOICEMEETER_DEVICE_PATTERN = /voice\s*meeter|voicemeeter/i

function isVoicemeeterOutputDevice(
  device: AudioOutputStatus['devices'][number] | undefined
): boolean {
  return Boolean(
    device &&
    (device.backend === 'voicemeeter' ||
      VOICEMEETER_DEVICE_PATTERN.test(device.id) ||
      VOICEMEETER_DEVICE_PATTERN.test(device.name))
  )
}

function resolveVoicemeeterDeviceId(
  settings: AudioOutputSettings,
  status: AudioOutputStatus = audioOutputStatus.value
): string {
  const selectedDeviceId = settings.deviceId.trim()
  if (selectedDeviceId) {
    const selectedDevice = status.devices.find(device => device.id === selectedDeviceId)
    if (
      isVoicemeeterOutputDevice(selectedDevice) ||
      (!selectedDevice && VOICEMEETER_DEVICE_PATTERN.test(selectedDeviceId))
    ) {
      return selectedDeviceId
    }
  }

  return status.devices.find(isVoicemeeterOutputDevice)?.id ?? ''
}

function normalizeAudioOutputSettingsForMode(
  settings: AudioOutputSettings,
  status: AudioOutputStatus = audioOutputStatus.value
): AudioOutputSettings {
  const normalizedSettings = cloneAudioOutputSettings(settings)

  if (normalizedSettings.mode !== 'exclusive') {
    normalizedSettings.bitPerfectRequired = false
  }

  if (normalizedSettings.mode === 'voicemeeter') {
    normalizedSettings.deviceId = resolveVoicemeeterDeviceId(normalizedSettings, status)
  }

  return normalizedSettings
}

function setAudioOutputStatusIfCurrent(status: AudioOutputStatus, requestId: number): void {
  if (requestId === audioOutputStatusRequestId) {
    audioOutputStatus.value = status
  }
}

function setAudioOutputStatusFromSubscription(status: AudioOutputStatus): void {
  audioOutputStatusRequestId += 1
  audioOutputStatus.value = status
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
      setAudioOutputStatusFromSubscription(status)
    })
    isAudioOutputStatusListenerRegistered = true
  }

  if (!isAudioOutputInitialized) {
    const restoredState = sanitizeAudioOutputState(
      storageService.getJSON<unknown>(AUDIO_OUTPUT_STORAGE_KEY)
    )
    audioOutputState.value = {
      enabled: restoredState.enabled,
      settings: normalizeAudioOutputSettingsForMode(restoredState.settings)
    }
    isAudioOutputInitialized = true
    void syncAudioOutputStatusFromMain()
    void syncAudioOutputEnabledToMain(audioOutputState.value.enabled)
  }

  if (!isSharedOutputDeviceListenerRegistered && mediaDevices?.addEventListener) {
    mediaDevices.addEventListener('devicechange', () => {
      void refreshSharedOutputDevices()
    })
    isSharedOutputDeviceListenerRegistered = true
  }

  function persist(nextState: AudioOutputState): void {
    const persistedState = {
      enabled: nextState.enabled,
      settings: cloneAudioOutputSettings(nextState.settings)
    }
    audioOutputState.value = persistedState
    storageService.setJSON(AUDIO_OUTPUT_STORAGE_KEY, persistedState)
  }

  async function syncAudioOutputStatusFromMain(): Promise<AudioOutputStatus> {
    const requestId = ++audioOutputStatusRequestId

    if (!audioOutputMainBridge?.getStatus) {
      return audioOutputStatus.value
    }

    try {
      const status = await Promise.resolve(audioOutputMainBridge.getStatus())
      if (isAudioOutputStatus(status)) {
        setAudioOutputStatusIfCurrent(status, requestId)
        return status
      }
    } catch (error) {
      console.warn('[AudioOutput] Failed to fetch native audio output status', error)
    }

    return audioOutputStatus.value
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

  async function syncAudioOutputEnabledToMain(enabled: boolean): Promise<AudioOutputStatus> {
    const requestId = ++audioOutputStatusRequestId
    const nextState = {
      enabled,
      settings: cloneAudioOutputSettings(audioOutputState.value.settings)
    }

    if (!audioOutputMainBridge) {
      const status = createUnavailableStatus(
        nextState,
        'Native audio output service is unavailable in this runtime.'
      )
      setAudioOutputStatusIfCurrent(status, requestId)
      return status
    }

    const pendingStatus = createUnavailableStatus(
      nextState,
      enabled ? 'Native audio output backend is starting.' : 'Native audio output is disabled.'
    )
    setAudioOutputStatusIfCurrent(pendingStatus, requestId)

    try {
      const status = await Promise.resolve(
        audioOutputMainBridge.setEnabled(enabled, nextState.settings)
      )
      if (isAudioOutputStatus(status)) {
        setAudioOutputStatusIfCurrent(status, requestId)
        return status
      }
    } catch (error) {
      const status = createSyncFailedStatus(nextState, error)
      setAudioOutputStatusIfCurrent(status, requestId)
      console.warn('[AudioOutput] Failed to sync native audio output state', error)
      return status
    }

    return pendingStatus
  }

  async function syncAudioOutputSettingsToMain(
    settings: AudioOutputSettings
  ): Promise<AudioOutputStatus> {
    const requestId = ++audioOutputStatusRequestId
    const sanitizedSettings = cloneAudioOutputSettings(settings)

    if (!audioOutputMainBridge) {
      const status = createUnavailableStatus(
        {
          ...audioOutputState.value,
          settings: sanitizedSettings
        },
        'Native audio output service is unavailable in this runtime.'
      )
      setAudioOutputStatusIfCurrent(status, requestId)
      return status
    }

    try {
      const status = await Promise.resolve(audioOutputMainBridge.updateSettings(sanitizedSettings))
      if (isAudioOutputStatus(status)) {
        setAudioOutputStatusIfCurrent(status, requestId)
        return status
      }
    } catch (error) {
      const status = createSyncFailedStatus(
        {
          ...audioOutputState.value,
          settings: sanitizedSettings
        },
        error
      )
      setAudioOutputStatusIfCurrent(status, requestId)
      console.warn('[AudioOutput] Failed to sync native audio output settings', error)
      throw error
    }

    const error = new Error('Native audio output service did not return a settings status.')
    const status = createSyncFailedStatus(
      {
        ...audioOutputState.value,
        settings: sanitizedSettings
      },
      error
    )
    setAudioOutputStatusIfCurrent(status, requestId)
    throw error
  }

  function setAudioOutputEnabled(next: boolean): Promise<AudioOutputStatus> {
    persist({
      ...audioOutputState.value,
      enabled: next
    })
    return syncAudioOutputEnabledToMain(next)
  }

  async function updateAudioOutputSettings(
    nextSettings: Record<string, unknown>
  ): Promise<AudioOutputSettings> {
    const settings = normalizeAudioOutputSettingsForMode(
      sanitizeAudioOutputSettings({
        ...audioOutputState.value.settings,
        ...nextSettings
      })
    )

    persist({
      ...audioOutputState.value,
      settings
    })
    await syncAudioOutputSettingsToMain(settings)
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
