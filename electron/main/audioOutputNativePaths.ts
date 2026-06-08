import { existsSync } from 'node:fs'
import path from 'node:path'

export const AUDIO_OUTPUT_HELPER_BASENAME = 'audio-output-helper'
export const AUDIO_OUTPUT_HELPER_WINDOWS_NAME = `${AUDIO_OUTPUT_HELPER_BASENAME}.exe`

export type AudioOutputHelperPathOptions = {
  appPath?: string
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  platform?: NodeJS.Platform
  resourcesPath?: string
}

export function getAudioOutputHelperFileName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? AUDIO_OUTPUT_HELPER_WINDOWS_NAME : AUDIO_OUTPUT_HELPER_BASENAME
}

export function resolveAudioOutputHelperPath(
  options: AudioOutputHelperPathOptions = {}
): string | null {
  const platform = options.platform ?? process.platform
  const helperFileName = getAudioOutputHelperFileName(platform)
  const appPath = options.appPath ?? process.cwd()
  const exists = options.exists ?? existsSync
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? appPath
  const candidates = options.isPackaged
    ? [path.join(resourcesPath, 'native', helperFileName)]
    : [
        path.join(appPath, 'native', 'audio-output-helper', 'target', 'debug', helperFileName),
        path.join(appPath, 'build', 'native', helperFileName),
        path.join(appPath, 'native', 'audio-output-helper', 'target', 'release', helperFileName)
      ]

  return candidates.find(candidate => exists(candidate)) ?? null
}
