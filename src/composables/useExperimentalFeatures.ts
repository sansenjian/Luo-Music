import { computed, ref } from 'vue'

import { services } from '@/services'
import type { StorageService } from '@/services/storageService'

export type ExperimentalFeaturesState = {
  smtcEnabled: boolean
}

const EXPERIMENTAL_FEATURES_STORAGE_KEY = 'experimentalFeatures'
const DEFAULT_EXPERIMENTAL_FEATURES: ExperimentalFeaturesState = {
  smtcEnabled: false
}

const experimentalFeaturesState = ref<ExperimentalFeaturesState>({
  ...DEFAULT_EXPERIMENTAL_FEATURES
})

let isExperimentalFeaturesInitialized = false

function sanitizeExperimentalFeatures(value: unknown): ExperimentalFeaturesState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_EXPERIMENTAL_FEATURES }
  }

  const record = value as Partial<Record<keyof ExperimentalFeaturesState, unknown>>

  return {
    smtcEnabled:
      typeof record.smtcEnabled === 'boolean'
        ? record.smtcEnabled
        : DEFAULT_EXPERIMENTAL_FEATURES.smtcEnabled
  }
}

export type ExperimentalFeaturesDeps = {
  storageService?: Pick<StorageService, 'getJSON' | 'setJSON'>
}

export function useExperimentalFeatures(deps: ExperimentalFeaturesDeps = {}) {
  const storageService = deps.storageService ?? services.storage()

  if (!isExperimentalFeaturesInitialized) {
    experimentalFeaturesState.value = sanitizeExperimentalFeatures(
      storageService.getJSON<unknown>(EXPERIMENTAL_FEATURES_STORAGE_KEY)
    )
    isExperimentalFeaturesInitialized = true
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
  }

  return {
    experimentalFeatures: experimentalFeaturesState,
    smtcEnabled: computed(() => experimentalFeaturesState.value.smtcEnabled),
    setSMTCEnabled
  }
}
