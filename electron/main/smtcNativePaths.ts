import { existsSync } from 'node:fs'
import path from 'node:path'

export const SMTC_HELPER_EXE_NAME = 'smtc-helper.exe'

export type SmtcHelperPathOptions = {
  appPath?: string
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  platform?: NodeJS.Platform
  resourcesPath?: string
}

export function resolveSmtcHelperPath(options: SmtcHelperPathOptions = {}): string | null {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return null
  }

  const appPath = options.appPath ?? process.cwd()
  const exists = options.exists ?? existsSync
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? appPath
  const candidates = options.isPackaged
    ? [path.join(resourcesPath, 'native', SMTC_HELPER_EXE_NAME)]
    : [
        path.join(appPath, 'native', 'smtc-helper', 'target', 'debug', SMTC_HELPER_EXE_NAME),
        path.join(appPath, 'build', 'native', SMTC_HELPER_EXE_NAME),
        path.join(appPath, 'native', 'smtc-helper', 'target', 'release', SMTC_HELPER_EXE_NAME)
      ]

  return candidates.find(candidate => exists(candidate)) ?? null
}
