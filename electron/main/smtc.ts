import { app } from 'electron'
import Store from 'electron-store'

import {
  EXPERIMENTAL_FEATURES_STORAGE_KEY,
  sanitizeExperimentalFeatures,
  type ExperimentalFeaturesState
} from '@/extensions/experimentalFeatures'
import { resolveSmtcHelperPath, type SmtcHelperPathOptions } from './smtcNativePaths'

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

type SmtcCommandLineOptions = SmtcHelperPathOptions & {
  nativeHelperAvailable?: boolean
}

function readExperimentalFeatures(): ExperimentalFeaturesState {
  return sanitizeExperimentalFeatures(store.get<unknown>(EXPERIMENTAL_FEATURES_STORAGE_KEY))
}

function writeExperimentalFeatures(nextState: ExperimentalFeaturesState): void {
  store.set(EXPERIMENTAL_FEATURES_STORAGE_KEY, nextState)
}

export function isSmtcCommandLineEnabled(): boolean {
  return smtcCommandLineEnabled
}

export function shouldUseChromiumSmtc(
  state: ExperimentalFeaturesState,
  options: SmtcCommandLineOptions = {}
): boolean {
  if (!state.smtcEnabled) {
    return false
  }

  const nativeHelperAvailable =
    options.nativeHelperAvailable ?? Boolean(resolveSmtcHelperPath(options))

  return !nativeHelperAvailable
}

export function configureSmtcCommandLineForState(
  state: ExperimentalFeaturesState,
  options: SmtcCommandLineOptions = {}
): boolean {
  const chromiumEnabled = shouldUseChromiumSmtc(state, options)
  smtcCommandLineEnabled = chromiumEnabled

  app.commandLine.appendSwitch(
    chromiumEnabled ? 'enable-features' : 'disable-features',
    SMTC_CHROMIUM_FEATURES
  )

  return chromiumEnabled
}

export function configureSmtcCommandLine(): boolean {
  return configureSmtcCommandLineForState(readExperimentalFeatures(), {
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  })
}

export function setSmtcEnabledFromRenderer(enabled: boolean): { restartRequired: boolean } {
  const currentState = readExperimentalFeatures()
  writeExperimentalFeatures({
    ...currentState,
    smtcEnabled: enabled
  })

  return { restartRequired: smtcCommandLineEnabled !== enabled }
}
