import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const AUDIO_OUTPUT_CACHE_DIR_NAME = 'audio-output-cache'

export type CacheDirectoryClearResult = {
  removed: string[]
  failed: { path: string; error: string }[]
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const unit = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), units.length - 1)
  return `${Number.parseFloat((bytes / unit ** index).toFixed(2))} ${units[index]}`
}

export async function getDirectorySize(directoryPath: string): Promise<number> {
  const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => [])
  const sizes = await Promise.all(
    entries.map(async entry => {
      const entryPath = join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        return getDirectorySize(entryPath)
      }
      if (!entry.isFile()) {
        return 0
      }

      return stat(entryPath)
        .then(fileStats => fileStats.size)
        .catch(() => 0)
    })
  )

  return sizes.reduce((total, size) => total + size, 0)
}

export async function clearDirectoryContents(
  directoryPath: string
): Promise<CacheDirectoryClearResult> {
  const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => [])
  const results = await Promise.all(
    entries.map(async entry => {
      const entryPath = join(directoryPath, entry.name)
      try {
        await rm(entryPath, { recursive: true, force: true })
        return { removed: entryPath }
      } catch (error) {
        return { failed: { path: entryPath, error: getErrorMessage(error) } }
      }
    })
  )

  return {
    removed: results.flatMap(result =>
      'removed' in result && result.removed ? [result.removed] : []
    ),
    failed: results.flatMap(result => ('failed' in result && result.failed ? [result.failed] : []))
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
