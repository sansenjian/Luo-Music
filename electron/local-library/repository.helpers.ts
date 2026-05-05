import { createHash } from 'node:crypto'
import path from 'node:path'

import type { Artist } from '@/types/schemas'
import type { LocalLibraryArtistSummary } from '@/types/localLibrary'
import { LOCAL_LIBRARY_DEFAULT_PAGE_SIZE } from '@/types/localLibrary'

export function resolveDefaultDatabasePath(): string {
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

  return path.join(userDataPath ?? path.resolve(process.cwd(), '.userData'), 'local-library.db')
}

export function normalizeFolderPath(folderPath: string): string {
  return path.resolve(folderPath).replace(/[\\/]+$/, '')
}

export function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath)
}

export function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function createPathKey(targetPath: string): string {
  return normalizeFolderPath(targetPath).toLocaleLowerCase()
}

export function createFilePathKey(filePath: string): string {
  return normalizeFilePath(filePath).toLocaleLowerCase()
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0
  }

  const matched = /^offset:(\d+)$/.exec(cursor)
  if (!matched) {
    return 0
  }

  const offset = Number.parseInt(matched[1] ?? '0', 10)
  return Number.isFinite(offset) && offset > 0 ? offset : 0
}

export function encodeCursor(offset: number, total: number): string | null {
  if (offset >= total) {
    return null
  }

  return `offset:${offset}`
}

export function toPageLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return LOCAL_LIBRARY_DEFAULT_PAGE_SIZE
  }

  return Math.max(1, Math.min(200, Math.floor(limit ?? LOCAL_LIBRARY_DEFAULT_PAGE_SIZE)))
}

export function createFolderId(folderPath: string): string {
  const normalized = normalizeFolderPath(folderPath).toLocaleLowerCase()
  const hash = createHash('sha1').update(normalized).digest('hex')
  return `local-folder:${hash}`
}

export function createTrackId(prefix: string, filePath: string): string {
  const normalized = normalizeFilePath(filePath).toLocaleLowerCase()
  const hash = createHash('sha1').update(normalized).digest('hex')
  return `${prefix}${hash}`
}

export function createArtistId(artistName: string): string {
  const hash = createHash('sha1').update(normalizeText(artistName)).digest('hex')
  return `local-artist:${hash}`
}

export function splitLocalArtistNames(artistName: string): string[] {
  const normalizedArtistName = artistName.trim()
  const artistNames = normalizedArtistName
    .split('/')
    .map(name => name.trim())
    .filter(Boolean)

  if (artistNames.length > 0) {
    return [...new Set(artistNames)]
  }

  return [normalizedArtistName || '未知艺术家']
}

export function createLocalSongArtists(artistName: string): Artist[] {
  return splitLocalArtistNames(artistName).map(name => ({
    id: createArtistId(name),
    name
  }))
}

export function matchesLocalArtistName(artistCredit: string, artistName: string): boolean {
  const normalizedArtistName = normalizeText(artistName)

  return splitLocalArtistNames(artistCredit).some(
    candidateArtistName => normalizeText(candidateArtistName) === normalizedArtistName
  )
}

type LocalArtistSummarySource = {
  artist: string
  duration: number
  coverHash: string | null
}

export function summarizeLocalArtists(
  tracks: LocalArtistSummarySource[],
  search?: string
): LocalLibraryArtistSummary[] {
  const normalizedSearch = search?.trim() ? normalizeText(search) : null
  const summaries = new Map<string, LocalLibraryArtistSummary>()

  for (const track of tracks) {
    for (const artistName of splitLocalArtistNames(track.artist)) {
      if (normalizedSearch && !normalizeText(artistName).includes(normalizedSearch)) {
        continue
      }

      const summary = summaries.get(artistName)
      if (summary) {
        summary.trackCount += 1
        summary.totalDuration += track.duration
        if (!summary.coverHash && track.coverHash) {
          summary.coverHash = track.coverHash
        }
        continue
      }

      summaries.set(artistName, {
        id: createArtistId(artistName),
        name: artistName,
        trackCount: 1,
        totalDuration: track.duration,
        coverHash: track.coverHash
      })
    }
  }

  return [...summaries.values()].sort((left, right) =>
    normalizeText(left.name).localeCompare(normalizeText(right.name))
  )
}

export function createAlbumId(artistName: string, albumName: string): string {
  const hash = createHash('sha1')
    .update(`${normalizeText(artistName)}\u0000${normalizeText(albumName)}`)
    .digest('hex')
  return `local-album:${hash}`
}
