import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { LocalLibraryCoverSize } from '@shared/types/localLibrary'

const RESOLVED_PATH_CACHE_MAX_ENTRIES = 500
const LOCAL_LIBRARY_COVER_SIZES = new Set<LocalLibraryCoverSize>(['thumb', 'album', 'large'])
const RESIZED_COVER_EXTENSION = 'png'
const LOCAL_LIBRARY_COVER_SIZE_PIXELS: Record<Exclude<LocalLibraryCoverSize, 'large'>, number> = {
  thumb: 96,
  album: 512
}

export type LocalLibraryCoverResizeInput = {
  data: Buffer
  maxSize: number
  size: Exclude<LocalLibraryCoverSize, 'large'>
}

export type LocalLibraryCoverResizer = (
  input: LocalLibraryCoverResizeInput
) => Buffer | null | Promise<Buffer | null>

type ElectronUserDataModule =
  | string
  | {
      app?: {
        getPath(name: 'userData'): string
      }
      nativeImage?: {
        createFromBuffer(data: Buffer): {
          isEmpty?(): boolean
          resize(options: { width: number; height: number; quality: 'good' }): {
            toPNG(): Buffer
          }
        }
      }
    }

function loadElectronUserDataModule(): ElectronUserDataModule | null {
  try {
    return require('electron') as ElectronUserDataModule
  } catch {
    return null
  }
}

function resolveCoverDirectoryPath(): string {
  const electronModule = loadElectronUserDataModule()
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
  private readonly resizer: LocalLibraryCoverResizer | null
  private readonly resolvedPathCache = new Map<string, string>()

  constructor(
    coverDirectoryPath = resolveCoverDirectoryPath(),
    resizer: LocalLibraryCoverResizer | null = createDefaultCoverResizer()
  ) {
    this.coverDirectoryPath = coverDirectoryPath
    this.resizer = resizer
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

    try {
      await writeFile(filePath, data, { flag: 'wx' })
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error
      }
    }

    this.setResolvedPathCache(createResolvedPathCacheKey(hash, 'large'), filePath)
    return hash
  }

  async getCoverDataUrl(
    hash: string,
    size: LocalLibraryCoverSize = 'large'
  ): Promise<string | null> {
    let filePath = await this.resolveCoverPath(hash, size)
    if (!filePath) {
      return null
    }

    try {
      const fileBuffer = await readFile(filePath)
      return `data:${inferMimeType(filePath)};base64,${fileBuffer.toString('base64')}`
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }

      this.resolvedPathCache.delete(createResolvedPathCacheKey(hash, size))
      filePath = await this.resolveCoverPath(hash, size)
      if (!filePath) {
        return null
      }

      const fileBuffer = await readFile(filePath)
      return `data:${inferMimeType(filePath)};base64,${fileBuffer.toString('base64')}`
    }
  }

  async cleanupUnusedCovers(usedHashes: Set<string>): Promise<void> {
    const entries = await readdir(this.coverDirectoryPath, { withFileTypes: true })
    await Promise.all(
      entries.map(async entry => {
        if (
          entry.isDirectory() &&
          LOCAL_LIBRARY_COVER_SIZES.has(entry.name as LocalLibraryCoverSize)
        ) {
          await this.cleanupUnusedCoverFiles(
            path.join(this.coverDirectoryPath, entry.name),
            usedHashes
          )
          return
        }

        await this.cleanupUnusedCoverFile(this.coverDirectoryPath, entry.name, usedHashes)
      })
    )
  }

  private async resolveCoverPath(
    hash: string,
    size: LocalLibraryCoverSize
  ): Promise<string | null> {
    const cacheKey = createResolvedPathCacheKey(hash, size)
    const cachedPath = this.resolvedPathCache.get(cacheKey)
    if (cachedPath) {
      this.setResolvedPathCache(cacheKey, cachedPath)
      return cachedPath
    }

    if (size !== 'large') {
      const sizedPath = await this.resolveSizedCoverPath(hash, size)
      if (sizedPath) {
        this.setResolvedPathCache(cacheKey, sizedPath)
        return sizedPath
      }

      const generatedPath = await this.generateSizedCover(hash, size)
      if (generatedPath) {
        this.setResolvedPathCache(cacheKey, generatedPath)
        return generatedPath
      }
    }

    const entries = await readdir(this.coverDirectoryPath, { withFileTypes: true })
    const matchedEntry = entries.find(entry => entry.isFile() && entry.name.startsWith(`${hash}.`))
    if (!matchedEntry) {
      return null
    }

    const filePath = path.join(this.coverDirectoryPath, matchedEntry.name)
    this.setResolvedPathCache(cacheKey, filePath)
    return filePath
  }

  private async resolveSizedCoverPath(
    hash: string,
    size: Exclude<LocalLibraryCoverSize, 'large'>
  ): Promise<string | null> {
    const sizedDirectoryPath = path.join(this.coverDirectoryPath, size)
    if (!existsSync(sizedDirectoryPath)) {
      return null
    }

    const entries = await readdir(sizedDirectoryPath, { withFileTypes: true })
    const matchedEntry = entries.find(entry => entry.isFile() && entry.name.startsWith(`${hash}.`))
    return matchedEntry ? path.join(sizedDirectoryPath, matchedEntry.name) : null
  }

  private async generateSizedCover(
    hash: string,
    size: Exclude<LocalLibraryCoverSize, 'large'>
  ): Promise<string | null> {
    const originalPath = await this.resolveCoverPath(hash, 'large')
    if (!originalPath) {
      return null
    }

    if (!this.resizer) {
      return originalPath
    }

    try {
      const originalBuffer = await readFile(originalPath)
      const resizedBuffer = await this.resizer({
        data: originalBuffer,
        maxSize: LOCAL_LIBRARY_COVER_SIZE_PIXELS[size],
        size
      })
      if (!Buffer.isBuffer(resizedBuffer) || resizedBuffer.length === 0) {
        return originalPath
      }

      const sizedDirectoryPath = path.join(this.coverDirectoryPath, size)
      if (!existsSync(sizedDirectoryPath)) {
        mkdirSync(sizedDirectoryPath, { recursive: true })
      }

      const sizedPath = path.join(sizedDirectoryPath, `${hash}.${RESIZED_COVER_EXTENSION}`)
      try {
        await writeFile(sizedPath, resizedBuffer, { flag: 'wx' })
      } catch (error) {
        if (!isFileAlreadyExistsError(error)) {
          throw error
        }
      }

      return sizedPath
    } catch {
      return originalPath
    }
  }

  private async cleanupUnusedCoverFiles(
    directoryPath: string,
    usedHashes: Set<string>
  ): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    await Promise.all(
      entries.map(entry => this.cleanupUnusedCoverFile(directoryPath, entry.name, usedHashes))
    )
  }

  private async cleanupUnusedCoverFile(
    directoryPath: string,
    entryName: string,
    usedHashes: Set<string>
  ): Promise<void> {
    const matched = /^([a-f0-9]+)\./i.exec(entryName)
    if (!matched) {
      return
    }

    const hash = matched[1] ?? ''
    if (usedHashes.has(hash)) {
      return
    }

    this.deleteResolvedPathCacheEntries(hash)
    await rm(path.join(directoryPath, entryName), { force: true })
  }

  private deleteResolvedPathCacheEntries(hash: string): void {
    for (const size of LOCAL_LIBRARY_COVER_SIZES) {
      this.resolvedPathCache.delete(createResolvedPathCacheKey(hash, size))
    }
  }

  private setResolvedPathCache(cacheKey: string, filePath: string): void {
    if (this.resolvedPathCache.has(cacheKey)) {
      this.resolvedPathCache.delete(cacheKey)
    }

    this.resolvedPathCache.set(cacheKey, filePath)

    if (this.resolvedPathCache.size <= RESOLVED_PATH_CACHE_MAX_ENTRIES) {
      return
    }

    const oldestEntryKey = this.resolvedPathCache.keys().next().value
    if (typeof oldestEntryKey === 'string') {
      this.resolvedPathCache.delete(oldestEntryKey)
    }
  }
}

function createResolvedPathCacheKey(hash: string, size: LocalLibraryCoverSize): string {
  return `${size}:${hash}`
}

function createDefaultCoverResizer(): LocalLibraryCoverResizer | null {
  const electronModule = loadElectronUserDataModule()
  if (typeof electronModule !== 'object' || electronModule === null) {
    return null
  }

  const nativeImage = electronModule.nativeImage
  if (typeof nativeImage?.createFromBuffer !== 'function') {
    return null
  }

  return ({ data, maxSize }) => {
    const image = nativeImage.createFromBuffer(data)
    if (typeof image.isEmpty === 'function' && image.isEmpty()) {
      return null
    }

    const resizedImage = image.resize({
      width: maxSize,
      height: maxSize,
      quality: 'good'
    })
    const resizedBuffer = resizedImage.toPNG()
    return Buffer.isBuffer(resizedBuffer) && resizedBuffer.length > 0 ? resizedBuffer : null
  }
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EEXIST'
  )
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
