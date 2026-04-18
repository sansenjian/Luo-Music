import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RESOLVED_PATH_CACHE_MAX_ENTRIES = 500

function resolveCoverDirectoryPath(): string {
  const electronModule = require('electron') as
    | string
    | {
        app?: {
          getPath(name: 'userData'): string
        }
      }
  const userDataPath =
    typeof electronModule === 'object' && electronModule !== null && 'app' in electronModule
      ? electronModule.app?.getPath('userData')
      : undefined

  return path.join(userDataPath ?? path.resolve(process.cwd(), '.userData'), 'local-library-covers')
}

function inferFileExtension(format: string | null | undefined): string {
  const normalizedFormat = format?.trim().toLocaleLowerCase() ?? ''
  if (normalizedFormat.endsWith('jpeg') || normalizedFormat.endsWith('jpg')) {
    return 'jpg'
  }
  if (normalizedFormat.endsWith('png')) {
    return 'png'
  }
  if (normalizedFormat.endsWith('webp')) {
    return 'webp'
  }
  if (normalizedFormat.endsWith('gif')) {
    return 'gif'
  }

  return 'bin'
}

function inferMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase()
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

export class LocalLibraryCoverManager {
  private readonly coverDirectoryPath: string
  private readonly resolvedPathCache = new Map<string, string>()

  constructor(coverDirectoryPath = resolveCoverDirectoryPath()) {
    this.coverDirectoryPath = coverDirectoryPath
    if (!existsSync(this.coverDirectoryPath)) {
      mkdirSync(this.coverDirectoryPath, { recursive: true })
    }
  }

  async saveEmbeddedCover(data: Buffer, format?: string | null): Promise<string | null> {
    if (!Buffer.isBuffer(data) || data.length === 0) {
      return null
    }

    const hash = createHash('sha1').update(data).digest('hex')
    const extension = inferFileExtension(format)
    const filePath = path.join(this.coverDirectoryPath, `${hash}.${extension}`)

    if (!existsSync(filePath)) {
      await writeFile(filePath, data)
    }

    this.setResolvedPathCache(hash, filePath)
    return hash
  }

  async getCoverDataUrl(hash: string): Promise<string | null> {
    const filePath = await this.resolveCoverPath(hash)
    if (!filePath) {
      return null
    }

    const fileBuffer = await readFile(filePath)
    return `data:${inferMimeType(filePath)};base64,${fileBuffer.toString('base64')}`
  }

  async cleanupUnusedCovers(usedHashes: Set<string>): Promise<void> {
    const entries = await readdir(this.coverDirectoryPath, { withFileTypes: true })
    await Promise.all(
      entries.map(async entry => {
        if (!entry.isFile()) {
          return
        }

        const matched = /^([a-f0-9]+)\./i.exec(entry.name)
        if (!matched) {
          return
        }

        const hash = matched[1] ?? ''
        if (usedHashes.has(hash)) {
          return
        }

        const entryPath = path.join(this.coverDirectoryPath, entry.name)
        this.resolvedPathCache.delete(hash)
        await rm(entryPath, { force: true })
      })
    )
  }

  private async resolveCoverPath(hash: string): Promise<string | null> {
    const cachedPath = this.resolvedPathCache.get(hash)
    if (cachedPath && existsSync(cachedPath)) {
      this.setResolvedPathCache(hash, cachedPath)
      return cachedPath
    }

    const entries = await readdir(this.coverDirectoryPath, { withFileTypes: true })
    const matchedEntry = entries.find(entry => entry.isFile() && entry.name.startsWith(`${hash}.`))
    if (!matchedEntry) {
      return null
    }

    const filePath = path.join(this.coverDirectoryPath, matchedEntry.name)
    this.setResolvedPathCache(hash, filePath)
    return filePath
  }

  private setResolvedPathCache(hash: string, filePath: string): void {
    if (this.resolvedPathCache.has(hash)) {
      this.resolvedPathCache.delete(hash)
    }

    this.resolvedPathCache.set(hash, filePath)

    if (this.resolvedPathCache.size <= RESOLVED_PATH_CACHE_MAX_ENTRIES) {
      return
    }

    const oldestEntryKey = this.resolvedPathCache.keys().next().value
    if (typeof oldestEntryKey === 'string') {
      this.resolvedPathCache.delete(oldestEntryKey)
    }
  }
}
