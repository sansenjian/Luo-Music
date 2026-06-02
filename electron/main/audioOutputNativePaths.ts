import { existsSync } from 'node:fs'
import path from 'node:path'

export const AUDIO_OUTPUT_HELPER_EXE_NAME = 'audio-output-helper.exe'

export type AudioOutputHelperPathOptions = {
  appPath?: string
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  platform?: NodeJS.Platform
  resourcesPath?: string
}

export function resolveAudioOutputHelperPath(
  options: AudioOutputHelperPathOptions = {}
): string | null {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return null
  }

  const appPath = options.appPath ?? process.cwd()
  const exists = options.exists ?? existsSync
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? appPath
  const candidates = options.isPackaged
    ? [path.join(resourcesPath, 'native', AUDIO_OUTPUT_HELPER_EXE_NAME)]
    : [
        path.join(
          appPath,
          'native',
          'audio-output-helper',
          'target',
          'debug',
          AUDIO_OUTPUT_HELPER_EXE_NAME
        ),
        path.join(appPath, 'build', 'native', AUDIO_OUTPUT_HELPER_EXE_NAME),
        path.join(
          appPath,
          'native',
          'audio-output-helper',
          'target',
          'release',
          AUDIO_OUTPUT_HELPER_EXE_NAME
        )
      ]

  return candidates.find(candidate => exists(candidate)) ?? null
}
