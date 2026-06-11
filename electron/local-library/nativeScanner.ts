import { spawn } from 'node:child_process'
import type { ChildProcessByStdio, SpawnOptionsWithStdioTuple } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

export const LOCAL_LIBRARY_SCANNER_BASENAME = 'local-library-scanner'
export const LOCAL_LIBRARY_SCANNER_WINDOWS_NAME = `${LOCAL_LIBRARY_SCANNER_BASENAME}.exe`
export const LOCAL_LIBRARY_SCANNER_PATH_ENV = 'LUO_LOCAL_LIBRARY_SCANNER_PATH'
export const LOCAL_LIBRARY_SCANNER_DISABLE_ENV = 'LUO_DISABLE_LOCAL_LIBRARY_SCANNER'

type SpawnScanner = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'> & { windowsHide: boolean }
) => ChildProcessByStdio<null, Readable, Readable>

export type NativeAudioFileEntry = {
  modifiedAt: number
  path: string
  size: number
}

export type LocalLibraryScannerPathOptions = {
  appPath?: string
  env?: NodeJS.ProcessEnv
  exists?: (filePath: string) => boolean
  isPackaged?: boolean
  platform?: NodeJS.Platform
  resourcesPath?: string
}

export type NativeAudioFileCollectorOptions = LocalLibraryScannerPathOptions & {
  maxDepth?: number
  maxFiles?: number
  spawnScanner?: SpawnScanner
}

type NativeScannerMessage =
  | {
      modifiedAt?: unknown
      path?: unknown
      size?: unknown
      type: 'file'
    }
  | {
      count?: unknown
      type: 'done'
    }

const DEFAULT_AUDIO_FILE_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
  '.ape',
  '.opus'
]
const DEFAULT_MAX_AUDIO_SCAN_DEPTH = 10
const DEFAULT_MAX_AUDIO_FILE_COUNT = 10000
const STDERR_TAIL_LIMIT = 4096

export function getLocalLibraryScannerFileName(
  platform: NodeJS.Platform = process.platform
): string {
  return platform === 'win32' ? LOCAL_LIBRARY_SCANNER_WINDOWS_NAME : LOCAL_LIBRARY_SCANNER_BASENAME
}

export function resolveLocalLibraryScannerPath(
  options: LocalLibraryScannerPathOptions = {}
): string | null {
  const env = options.env ?? process.env
  if (env[LOCAL_LIBRARY_SCANNER_DISABLE_ENV] === '1') {
    return null
  }

  const platform = options.platform ?? process.platform
  const scannerFileName = getLocalLibraryScannerFileName(platform)
  const appPath = options.appPath ?? process.cwd()
  const exists = options.exists ?? existsSync
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? appPath
  const explicitPath = env[LOCAL_LIBRARY_SCANNER_PATH_ENV]?.trim()
  const candidates = explicitPath
    ? [path.resolve(appPath, explicitPath)]
    : options.isPackaged
      ? [path.join(resourcesPath, 'native', scannerFileName)]
      : [
          path.join(appPath, 'native', 'local-library-scanner', 'target', 'debug', scannerFileName),
          path.join(appPath, 'build', 'native', scannerFileName),
          path.join(
            appPath,
            'native',
            'local-library-scanner',
            'target',
            'release',
            scannerFileName
          )
        ]

  return candidates.find(candidate => exists(candidate)) ?? null
}

export async function collectNativeAudioFileEntries(
  rootPath: string,
  options: NativeAudioFileCollectorOptions = {}
): Promise<NativeAudioFileEntry[] | null> {
  const scannerPath = resolveLocalLibraryScannerPath(options)
  if (!scannerPath) {
    return null
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_AUDIO_SCAN_DEPTH
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_AUDIO_FILE_COUNT
  const args = [
    '--root',
    rootPath,
    '--extensions',
    DEFAULT_AUDIO_FILE_EXTENSIONS.join(','),
    '--max-depth',
    String(maxDepth),
    '--max-files',
    String(maxFiles)
  ]
  const child = (options.spawnScanner ?? spawn)(scannerPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const files: NativeAudioFileEntry[] = []
  let stderrTail = ''

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderrTail = `${stderrTail}${String(chunk)}`.slice(-STDERR_TAIL_LIMIT)
  })

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        resolve({ code, signal })
      })
    }
  )

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of lines) {
    const file = parseNativeScannerLine(line)
    if (!file) {
      continue
    }

    files.push(file)
  }

  const exitStatus = await exitPromise
  if (exitStatus.code !== 0) {
    throw new Error(
      `local-library-scanner exited with code ${exitStatus.code ?? 'null'} signal ${
        exitStatus.signal ?? 'null'
      }: ${stderrTail.trim()}`
    )
  }

  return files
}

export function parseNativeScannerLine(line: string): NativeAudioFileEntry | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const parsed = JSON.parse(trimmed) as NativeScannerMessage
  if (!parsed || typeof parsed !== 'object' || parsed.type !== 'file') {
    return null
  }

  if (
    typeof parsed.path !== 'string' ||
    typeof parsed.size !== 'number' ||
    typeof parsed.modifiedAt !== 'number'
  ) {
    return null
  }

  return {
    modifiedAt: Math.max(0, Math.round(parsed.modifiedAt)),
    path: parsed.path,
    size: Math.max(0, Math.round(parsed.size))
  }
}
