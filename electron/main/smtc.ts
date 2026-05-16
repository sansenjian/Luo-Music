import { app } from 'electron'

import {
  EXPERIMENTAL_FEATURES_STORAGE_KEY,
  sanitizeExperimentalFeatures,
  type ExperimentalFeaturesState
} from '@/extensions/experimentalFeatures'

type ElectronStoreShape = {
  get: <T>(key: string, defaultValue?: T) => T
  set: (key: string, value: unknown) => void
}

const StoreModule = require('electron-store') as {
  default?: new (options?: { projectName: string }) => ElectronStoreShape
}

const Store =
  StoreModule.default ??
  (StoreModule as unknown as new (options?: { projectName: string }) => ElectronStoreShape)

const store = new Store({ projectName: 'luo-music' })

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

export function configureSmtcCommandLine(): boolean {
  smtcCommandLineEnabled = true

  app.commandLine.appendSwitch('enable-features', SMTC_CHROMIUM_FEATURES)

  return true
}

export function setSmtcEnabledFromRenderer(enabled: boolean): { restartRequired: boolean } {
  const currentState = readExperimentalFeatures()
  writeExperimentalFeatures({
    ...currentState,
    smtcEnabled: enabled
  })

  return { restartRequired: false }
}
