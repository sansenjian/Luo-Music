import { computed, ref } from 'vue'

import {
  DEFAULT_EXPERIMENTAL_FEATURES,
  EXPERIMENTAL_FEATURES_STORAGE_KEY,
  sanitizeExperimentalFeatures,
  type ExperimentalFeaturesState
} from '@/extensions/experimentalFeatures'
import { INVOKE_CHANNELS } from '@/platform/contracts/protocol/channels'
import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

const experimentalFeaturesState = ref<ExperimentalFeaturesState>({
  ...DEFAULT_EXPERIMENTAL_FEATURES
})

let isExperimentalFeaturesInitialized = false

type SmtcMainBridge = {
  setEnabled(enabled: boolean): Promise<void> | void
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
      }
    }
  ).services

  if (typeof servicesBridge?.invoke !== 'function') {
    return null
  }

  return {
    async setEnabled(enabled: boolean): Promise<void> {
      await servicesBridge.invoke(INVOKE_CHANNELS.SMTC_SET_ENABLED, enabled)
    }
  }
}

export function useExperimentalFeatures(deps: ExperimentalFeaturesDeps = {}) {
  const storageService = deps.storageService ?? services.storage()
  const smtcMainBridge =
    deps.smtcMainBridge === undefined ? getDefaultSmtcMainBridge() : deps.smtcMainBridge

  if (!isExperimentalFeaturesInitialized) {
    experimentalFeaturesState.value = sanitizeExperimentalFeatures(
      storageService.getJSON<unknown>(EXPERIMENTAL_FEATURES_STORAGE_KEY)
    )
    isExperimentalFeaturesInitialized = true
    syncSMTCEnabledToMain(experimentalFeaturesState.value.smtcEnabled)
  }

  function syncSMTCEnabledToMain(enabled: boolean): void {
    void Promise.resolve(smtcMainBridge?.setEnabled(enabled)).catch(error => {
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
    setSMTCEnabled,
    waveformEnabled: computed(() => experimentalFeaturesState.value.waveformEnabled),
    setWaveformEnabled,
    coverSwipeEnabled: computed(() => experimentalFeaturesState.value.coverSwipeEnabled),
    setCoverSwipeEnabled
  }
}
