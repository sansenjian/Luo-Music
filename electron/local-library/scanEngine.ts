import type { LocalLibraryTrack } from '@/types/localLibrary'
import { LOCAL_LIBRARY_SONG_ID_PREFIX } from '@/types/localLibrary'

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

type LocalLibraryScanEngineOptions = {
  coverManager: LocalLibraryCoverManager
  isDisposed: () => boolean
  metadataReader: LocalTrackMetadataReader
  repository: LocalLibraryRepository
}

type ScanSingleFileOptions = {
  forceMetadataRefresh?: boolean
}

export class LocalLibraryScanEngine {
  constructor(private readonly options: LocalLibraryScanEngineOptions) {}

  async scanFolder(
    folder: PersistedFolder,
    onProgress: (nextScannedFiles: number) => void,
    initialScannedFiles: number
  ): Promise<LocalLibraryTrack[]> {
    if (this.options.isDisposed()) {
      return []
    }

    const filePaths = await collectAudioFiles(folder.path)
    const tracks: LocalLibraryTrack[] = []
    let scannedFiles = initialScannedFiles

    for (const filePath of filePaths) {
      if (this.options.isDisposed()) {
        return tracks
      }

      scannedFiles += 1
      onProgress(scannedFiles)

      const track = await this.scanSingleFile(folder, filePath)
      if (track) {
        tracks.push(track)
      }
    }

    return tracks
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

    const normalizedModifiedAt = Math.round(fileStats.mtimeMs)
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
    const metadata = await this.options.metadataReader(normalizedPath)
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

    if (Object.prototype.hasOwnProperty.call(metadata, 'coverData')) {
      if (metadata.coverData) {
        return this.options.coverManager.saveEmbeddedCover(metadata.coverData, metadata.coverFormat)
      }

      return null
    }

    return existingTrack?.coverHash ?? null
  }
}
