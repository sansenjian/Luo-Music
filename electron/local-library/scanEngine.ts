import { LOCAL_LIBRARY_SONG_ID_PREFIX, type LocalLibraryTrack } from '@shared/types/localLibrary'

import { LocalLibraryCoverManager } from './coverManager'
import { createTrackId, LocalLibraryRepository } from './repository'
import type { PersistedFolder } from './repository.types'
import {
  collectAudioFiles,
  createTrackSong,
  isAudioFile,
  normalizeFilePath,
  parseTrackDisplayName,
  resolveFileStats,
  type LocalTrackMetadataReader,
  type ParsedLocalTrackMetadata
} from './service.helpers'

const PLimitModule = require('p-limit') as {
  default?: (concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T>
}
const createPromiseLimiter =
  PLimitModule.default ??
  (PLimitModule as unknown as (concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T>)

const SCAN_CONCURRENCY = 5

type LocalLibraryScanEngineOptions = {
  coverManager: LocalLibraryCoverManager
  isDisposed: () => boolean
  metadataReader: LocalTrackMetadataReader
  repository: LocalLibraryRepository
}

type ScanSingleFileOptions = {
  forceMetadataRefresh?: boolean
  skipCover?: boolean
}

export class LocalLibraryScanEngine {
  private readonly scanLimiter = createPromiseLimiter(SCAN_CONCURRENCY)

  constructor(private readonly options: LocalLibraryScanEngineOptions) {}

  async scanFolder(
    folder: PersistedFolder,
    onProgress: (nextScannedFiles: number) => void,
    initialScannedFiles: number,
    scanOptions: ScanSingleFileOptions = {}
  ): Promise<LocalLibraryTrack[]> {
    if (this.options.isDisposed()) {
      return []
    }

    const filePaths = await collectAudioFiles(folder.path)
    let scannedFiles = initialScannedFiles
    const results: (LocalLibraryTrack | null)[] = []

    const tasks = filePaths.map(filePath =>
      this.scanLimiter(async () => {
        if (this.options.isDisposed()) return null

        scannedFiles += 1
        onProgress(scannedFiles)

        return this.scanSingleFile(folder, filePath, scanOptions)
      })
    )

    const settled = await Promise.allSettled(tasks)
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      }
    }

    return results as LocalLibraryTrack[]
  }

  async scanSingleFile(
    folder: PersistedFolder,
    filePath: string,
    scanOptions: ScanSingleFileOptions = {}
  ): Promise<LocalLibraryTrack | null> {
    if (this.options.isDisposed()) {
      return null
    }

    const normalizedPath = normalizeFilePath(filePath)
    if (!isAudioFile(normalizedPath)) {
      return null
    }

    const fileStats = await resolveFileStats(normalizedPath)
    if (!fileStats?.isFile()) {
      return null
    }

    const normalizedModifiedAt = fileStats.mtimeMs
    const existingTrack = this.options.repository.findTrackByFilePath(normalizedPath)

    if (
      !scanOptions.forceMetadataRefresh &&
      existingTrack &&
      existingTrack.modifiedAt === normalizedModifiedAt &&
      existingTrack.fileSize === fileStats.size
    ) {
      return existingTrack
    }

    const parsedName = parseTrackDisplayName(normalizedPath.split(/[\\/]/).pop() ?? normalizedPath)
    const metadata = await this.options.metadataReader(normalizedPath, {
      skipCover: scanOptions.skipCover && !!existingTrack?.coverHash
    })
    const title = metadata?.title ?? parsedName.title
    const artist = metadata?.artist ?? parsedName.artist
    const album =
      metadata?.album ?? normalizedPath.split(/[\\/]/).slice(-2, -1)[0] ?? folder.name ?? '本地音乐'
    const duration = metadata?.duration ?? 0
    const coverHash = await this.resolveCoverHash(metadata, existingTrack)
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, normalizedPath)

    return {
      id: trackId,
      folderId: folder.id,
      filePath: normalizedPath,
      fileName: normalizedPath.split(/[\\/]/).pop() ?? normalizedPath,
      title,
      artist,
      album,
      duration,
      fileSize: fileStats.size,
      modifiedAt: normalizedModifiedAt,
      coverHash,
      song: createTrackSong(trackId, title, artist, album, normalizedPath, duration, coverHash)
    }
  }

  private async resolveCoverHash(
    metadata: ParsedLocalTrackMetadata | null,
    existingTrack: LocalLibraryTrack | null
  ): Promise<string | null> {
    if (!metadata) {
      return existingTrack?.coverHash ?? null
    }

    if (metadata.coverData === undefined) {
      return existingTrack?.coverHash ?? null
    }

    if (Object.prototype.hasOwnProperty.call(metadata, 'coverData')) {
      if (metadata.coverData) {
        return this.options.coverManager.saveEmbeddedCover(metadata.coverData, metadata.coverFormat)
      }

      return null
    }

    return existingTrack?.coverHash ?? null
  }
}
