import { app } from 'electron'
import Store from 'electron-store'

import {
  EXPERIMENTAL_FEATURES_STORAGE_KEY,
  sanitizeExperimentalFeatures,
  type ExperimentalFeaturesState
} from '@/extensions/experimentalFeatures'

type ElectronStoreShape = {
  get: <T>(key: string, defaultValue?: T) => T
  set: (key: string, value: unknown) => void
}

type ElectronStoreOptions = ConstructorParameters<typeof Store>[0] & {
  projectName: string
}

const store = new Store({
  projectName: 'luo-music'
} as ElectronStoreOptions) as ElectronStoreShape

const SMTC_CHROMIUM_FEATURES = 'HardwareMediaKeyHandling,MediaSessionService'

let smtcCommandLineEnabled = false

function readExperimentalFeatures(): ExperimentalFeaturesState {
  return sanitizeExperimentalFeatures(store.get<unknown>(EXPERIMENTAL_FEATURES_STORAGE_KEY))
}

function writeExperimentalFeatures(nextState: ExperimentalFeaturesState): void {
  store.set(EXPERIMENTAL_FEATURES_STORAGE_KEY, nextState)
}

export function isSmtcCommandLineEnabled(): boolean {
  return smtcCommandLineEnabled
}

export function configureSmtcCommandLineForState(state: ExperimentalFeaturesState): boolean {
  const enabled = state.smtcEnabled
  smtcCommandLineEnabled = enabled

  app.commandLine.appendSwitch(
    enabled ? 'enable-features' : 'disable-features',
    SMTC_CHROMIUM_FEATURES
  )

  return enabled
}

export function configureSmtcCommandLine(): boolean {
  return configureSmtcCommandLineForState(readExperimentalFeatures())
}

export function setSmtcEnabledFromRenderer(enabled: boolean): { restartRequired: boolean } {
  const currentState = readExperimentalFeatures()
  writeExperimentalFeatures({
    ...currentState,
    smtcEnabled: enabled
  })

  return { restartRequired: smtcCommandLineEnabled !== enabled }
}
