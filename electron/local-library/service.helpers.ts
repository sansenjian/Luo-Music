import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'
import { parseFile } from 'music-metadata'

import type { Song } from '@/types/schemas'
import type { LocalLibraryTrack } from '@/types/localLibrary'

import { createLocalMediaUrl } from './protocol'
import type { PersistedFolder } from './repository.types'

export type PersistedState = {
  folders: PersistedFolder[]
  tracks: Array<Omit<LocalLibraryTrack, 'coverHash'> & { coverHash?: string | null }>
}

export type LegacyStoreShape = {
  get: <T>(key: string, defaultValue?: T) => T
}

export type ParsedLocalTrackMetadata = {
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverData?: Buffer | null
  coverFormat?: string | null
}

export type LocalTrackMetadataReader = (
  filePath: string
) => Promise<ParsedLocalTrackMetadata | null>
export type LocalLibraryWatcherFactory = (folderPath: string) => FSWatcher
export type PendingFolderChanges = {
  upsert: Set<string>
  remove: Set<string>
  requiresFullRescan: boolean
}

const AUDIO_FILE_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
  '.ape',
  '.opus'
])

const StoreModule = require('electron-store') as {
  default?: new (options?: { projectName: string }) => LegacyStoreShape
}

const Store = StoreModule.default ?? (StoreModule as unknown as new () => LegacyStoreShape)

export function createDefaultLegacyStore(): LegacyStoreShape {
  return new Store({ projectName: 'luo-music' })
}

export function normalizeFolderPath(folderPath: string): string {
  return path.resolve(folderPath).replace(/[\\/]+$/, '')
}

export function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath)
}

export function parseTrackDisplayName(fileName: string): { artist: string; title: string } {
  const stem = path.parse(fileName).name.trim()
  if (!stem) {
    return {
      title: '未知歌曲',
      artist: '未知艺术家'
    }
  }

  const parts = stem
    .split(' - ')
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    return {
      artist: parts[0] ?? '未知艺术家',
      title: parts.slice(1).join(' - ')
    }
  }

  return {
    title: stem,
    artist: '未知艺术家'
  }
}

export function createDefaultWatcher(folderPath: string): FSWatcher {
  return chokidar.watch(folderPath, {
    ignored: /(^|[/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1200,
      pollInterval: 100
    }
  })
}

export async function readTrackMetadata(
  filePath: string
): Promise<ParsedLocalTrackMetadata | null> {
  try {
    const metadata = await parseFile(filePath)
    const picture = metadata.common.picture?.[0]
    const title =
      typeof metadata.common.title === 'string' && metadata.common.title.trim().length > 0
        ? metadata.common.title.trim()
        : null
    const artist =
      typeof metadata.common.artist === 'string' && metadata.common.artist.trim().length > 0
        ? metadata.common.artist.trim()
        : null
    const album =
      typeof metadata.common.album === 'string' && metadata.common.album.trim().length > 0
        ? metadata.common.album.trim()
        : null
    const duration =
      typeof metadata.format.duration === 'number' && Number.isFinite(metadata.format.duration)
        ? Math.max(0, Math.round(metadata.format.duration * 1000))
        : null

    if (!title && !artist && !album && duration === null && !picture) {
      return null
    }

    return {
      title,
      artist,
      album,
      duration,
      coverData: picture?.data ? Buffer.from(picture.data) : null,
      coverFormat: picture?.format ?? null
    }
  } catch {
    return null
  }
}

export function createTrackSong(
  trackId: string,
  title: string,
  artist: string,
  album: string,
  filePath: string,
  duration: number,
  coverHash: string | null
): Song {
  return {
    id: trackId,
    name: title,
    artists: [{ id: `local-artist:${artist}`, name: artist }],
    album: {
      id: `local-album:${album}`,
      name: album,
      picUrl: ''
    },
    duration,
    mvid: 0,
    platform: 'netease',
    originalId: trackId,
    url: createLocalMediaUrl(filePath),
    extra: {
      localSource: true,
      localFilePath: filePath,
      localAlbum: album,
      localCoverHash: coverHash
    }
  }
}

export function isAudioFile(filePath: string): boolean {
  return AUDIO_FILE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())
}

export function isLegacyState(value: unknown): value is PersistedState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PersistedState>
  return Array.isArray(candidate.folders) && Array.isArray(candidate.tracks)
}

export function createEmptyPendingFolderChanges(): PendingFolderChanges {
  return {
    upsert: new Set<string>(),
    remove: new Set<string>(),
    requiresFullRescan: false
  }
}

export async function collectAudioFiles(rootPath: string): Promise<string[]> {
  const queue = [rootPath]
  const files: string[] = []

  while (queue.length > 0) {
    const currentPath = queue.pop()
    if (!currentPath) {
      continue
    }

    const entries = await readdir(currentPath, {
      withFileTypes: true
    })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const entryPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        queue.push(entryPath)
        continue
      }

      if (entry.isFile() && isAudioFile(entryPath)) {
        files.push(entryPath)
      }
    }
  }

  return files
}

export async function resolveFileStats(filePath: string) {
  try {
    return await stat(filePath)
  } catch {
    return null
  }
}
