import { computed, ref } from 'vue'

import {
  DEFAULT_EXPERIMENTAL_FEATURES,
  EXPERIMENTAL_FEATURES_STORAGE_KEY,
  sanitizeExperimentalFeatures,
  type ExperimentalFeaturesState
} from '@/extensions/experimentalFeatures'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '@shared/protocol/channels'
import {
  createDefaultSmtcNativeStatus,
  isSmtcNativeStatus,
  type SmtcNativeStatus
} from '@shared/smtc/protocol'
import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

const experimentalFeaturesState = ref<ExperimentalFeaturesState>({
  ...DEFAULT_EXPERIMENTAL_FEATURES
})
const smtcNativeStatus = ref<SmtcNativeStatus>(createDefaultSmtcNativeStatus())

let isExperimentalFeaturesInitialized = false
let isSmtcStatusListenerRegistered = false

type SmtcMainBridge = {
  getStatus?(): Promise<SmtcNativeStatus | void> | SmtcNativeStatus | void
  setEnabled(enabled: boolean): Promise<SmtcNativeStatus | void> | SmtcNativeStatus | void
  subscribeStatus?(listener: (status: SmtcNativeStatus) => void): (() => void) | void
}

export type ExperimentalFeaturesDeps = {
  storageService?: Pick<StorageService, 'getJSON' | 'setJSON'>
  smtcMainBridge?: SmtcMainBridge | null
}

function getDefaultSmtcMainBridge(): SmtcMainBridge | null {
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
    async getStatus(): Promise<SmtcNativeStatus | void> {
      const result = await servicesBridge.invoke(INVOKE_CHANNELS.SMTC_GET_STATUS)
      if (isSmtcNativeStatus(result)) {
        return result
      }
    },
    async setEnabled(enabled: boolean): Promise<SmtcNativeStatus | void> {
      const result = await servicesBridge.invoke(INVOKE_CHANNELS.SMTC_SET_ENABLED, enabled)
      if (isSmtcNativeStatus(result)) {
        return result
      }
    },
    subscribeStatus(listener: (status: SmtcNativeStatus) => void): (() => void) | void {
      return servicesBridge.on?.(RECEIVE_CHANNELS.SMTC_STATUS_CHANGED, value => {
        if (isSmtcNativeStatus(value)) {
          listener(value)
        }
      })
    }
  }
}

function createPendingSmtcNativeStatus(): SmtcNativeStatus {
  return {
    ...createDefaultSmtcNativeStatus(),
    enabled: true,
    reason: 'Native SMTC backend is starting.'
  }
}

function createChromiumSmtcNativeStatus(enabled: boolean): SmtcNativeStatus {
  return {
    ...createDefaultSmtcNativeStatus(),
    enabled,
    backend: enabled ? 'chromium' : 'disabled'
  }
}

function createSmtcSyncFailedStatus(enabled: boolean, error: unknown): SmtcNativeStatus {
  return {
    ...createDefaultSmtcNativeStatus(),
    enabled,
    backend: enabled ? 'chromium' : 'disabled',
    reason: error instanceof Error ? error.message : String(error)
  }
}

export function useExperimentalFeatures(deps: ExperimentalFeaturesDeps = {}) {
  const storageService = deps.storageService ?? services.storage()
  const smtcMainBridge =
    deps.smtcMainBridge === undefined ? getDefaultSmtcMainBridge() : deps.smtcMainBridge

  if (!isSmtcStatusListenerRegistered && smtcMainBridge?.subscribeStatus) {
    smtcMainBridge.subscribeStatus(status => {
      smtcNativeStatus.value = status
    })
    isSmtcStatusListenerRegistered = true
  }

  if (!isExperimentalFeaturesInitialized) {
    experimentalFeaturesState.value = sanitizeExperimentalFeatures(
      storageService.getJSON<unknown>(EXPERIMENTAL_FEATURES_STORAGE_KEY)
    )
    isExperimentalFeaturesInitialized = true
    syncSMTCStatusFromMain()
    syncSMTCEnabledToMain(experimentalFeaturesState.value.smtcEnabled)
  }

  function syncSMTCStatusFromMain(): void {
    if (!smtcMainBridge?.getStatus) {
      return
    }

    void Promise.resolve(smtcMainBridge.getStatus())
      .then(status => {
        if (isSmtcNativeStatus(status)) {
          smtcNativeStatus.value = status
        }
      })
      .catch(error => {
        console.warn('[ExperimentalFeatures] Failed to fetch SMTC status from main process', error)
      })
  }

  function syncSMTCEnabledToMain(enabled: boolean): void {
    if (!smtcMainBridge) {
      smtcNativeStatus.value = createChromiumSmtcNativeStatus(enabled)
      return
    }

    smtcNativeStatus.value = enabled
      ? createPendingSmtcNativeStatus()
      : createDefaultSmtcNativeStatus()

    void Promise.resolve(smtcMainBridge.setEnabled(enabled))
      .then(status => {
        if (isSmtcNativeStatus(status)) {
          smtcNativeStatus.value = status
        }
      })
      .catch(error => {
        smtcNativeStatus.value = createSmtcSyncFailedStatus(enabled, error)
        console.warn('[ExperimentalFeatures] Failed to sync SMTC state to main process', error)
      })
  }

  function persist(nextState: ExperimentalFeaturesState): void {
    experimentalFeaturesState.value = { ...nextState }
    storageService.setJSON(EXPERIMENTAL_FEATURES_STORAGE_KEY, experimentalFeaturesState.value)
  }

  function setSMTCEnabled(next: boolean): void {
    persist({
      ...experimentalFeaturesState.value,
      smtcEnabled: next
    })
    syncSMTCEnabledToMain(next)
  }

  function setWaveformEnabled(next: boolean): void {
    persist({
      ...experimentalFeaturesState.value,
      waveformEnabled: next
    })
  }

  function setCoverSwipeEnabled(next: boolean): void {
    persist({
      ...experimentalFeaturesState.value,
      coverSwipeEnabled: next
    })
  }

  return {
    experimentalFeatures: experimentalFeaturesState,
    smtcEnabled: computed(() => experimentalFeaturesState.value.smtcEnabled),
    smtcNativeStatus: computed(() => smtcNativeStatus.value),
    setSMTCEnabled,
    waveformEnabled: computed(() => experimentalFeaturesState.value.waveformEnabled),
    setWaveformEnabled,
    coverSwipeEnabled: computed(() => experimentalFeaturesState.value.coverSwipeEnabled),
    setCoverSwipeEnabled
  }
}
