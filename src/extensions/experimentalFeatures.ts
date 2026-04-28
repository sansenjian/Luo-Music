export type ExperimentalFeaturesState = {
  smtcEnabled: boolean
  waveformEnabled: boolean
  coverSwipeEnabled: boolean
}

export const EXPERIMENTAL_FEATURES_STORAGE_KEY = 'experimentalFeatures'

export const DEFAULT_EXPERIMENTAL_FEATURES: ExperimentalFeaturesState = {
  smtcEnabled: false,
  waveformEnabled: false,
  coverSwipeEnabled: false
}

export function sanitizeExperimentalFeatures(value: unknown): ExperimentalFeaturesState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_EXPERIMENTAL_FEATURES }
  }

  const record = value as Partial<Record<keyof ExperimentalFeaturesState, unknown>>

  return {
    smtcEnabled:
      typeof record.smtcEnabled === 'boolean'
        ? record.smtcEnabled
        : DEFAULT_EXPERIMENTAL_FEATURES.smtcEnabled,
    waveformEnabled:
      typeof record.waveformEnabled === 'boolean'
        ? record.waveformEnabled
        : DEFAULT_EXPERIMENTAL_FEATURES.waveformEnabled,
    coverSwipeEnabled:
      typeof record.coverSwipeEnabled === 'boolean'
        ? record.coverSwipeEnabled
        : DEFAULT_EXPERIMENTAL_FEATURES.coverSwipeEnabled
  }
}
