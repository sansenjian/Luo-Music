import type { Song } from './schemas'

export const LOCAL_LIBRARY_SONG_ID_PREFIX = 'local:'
export const LOCAL_LIBRARY_DEFAULT_PAGE_SIZE = 60
export type LocalLibrarySongId = string & { readonly __brand: 'LocalLibrarySongId' }

export type LocalLibraryFolder = {
  id: string
  path: string
  name: string
  enabled: boolean
  createdAt: number
  lastScannedAt: number | null
  songCount: number
}

export type LocalLibraryTrack = {
  id: string
  folderId: string
  filePath: string
  fileName: string
  title: string
  artist: string
  album: string
  duration: number
  fileSize: number
  modifiedAt: number
  coverHash: string | null
  song: Song
}

export type LocalLibraryArtistSummary = {
  id: string
  name: string
  trackCount: number
  totalDuration: number
  coverHash: string | null
}

export type LocalLibraryAlbumSummary = {
  id: string
  name: string
  artist: string
  trackCount: number
  totalDuration: number
  coverHash: string | null
}

export type LocalLibraryViewMode = 'songs' | 'artists' | 'albums'

export type LocalLibraryCursor = string | null

export type LocalLibraryTrackQuery = {
  cursor?: LocalLibraryCursor
  limit?: number
  search?: string
  folderId?: string | null
  artist?: string | null
  album?: string | null
}

export type LocalLibrarySummaryQuery = {
  cursor?: LocalLibraryCursor
  limit?: number
  search?: string
}

export type LocalLibraryPage<T> = {
  items: T[]
  nextCursor: LocalLibraryCursor
  total: number
  limit: number
}

export type LocalLibraryScanPhase = 'idle' | 'scanning' | 'error'

export type LocalLibraryScanStatus = {
  phase: LocalLibraryScanPhase
  scannedFolders: number
  scannedFiles: number
  discoveredTracks: number
  currentFolder: string | null
  startedAt: number | null
  finishedAt: number | null
  message: string
}

export type LocalLibraryState = {
  supported: boolean
  folders: LocalLibraryFolder[]
  tracks: LocalLibraryTrack[]
  status: LocalLibraryScanStatus
}

export function createLocalLibraryScanStatus(
  status: Partial<LocalLibraryScanStatus> = {}
): LocalLibraryScanStatus {
  return {
    phase: 'idle',
    scannedFolders: 0,
    scannedFiles: 0,
    discoveredTracks: 0,
    currentFolder: null,
    startedAt: null,
    finishedAt: null,
    message: '还没有扫描本地音乐',
    ...status
  }
}

export function createUnsupportedLocalLibraryState(): LocalLibraryState {
  return {
    supported: false,
    folders: [],
    tracks: [],
    status: createLocalLibraryScanStatus({
      message: '本地音乐仅支持 Electron 桌面端'
    })
  }
}

export function createEmptyLocalLibraryPage<T>(
  limit = LOCAL_LIBRARY_DEFAULT_PAGE_SIZE
): LocalLibraryPage<T> {
  return {
    items: [],
    nextCursor: null,
    total: 0,
    limit
  }
}

export function isLocalLibrarySongId(id: string | number): id is LocalLibrarySongId {
  return typeof id === 'string' && id.startsWith(LOCAL_LIBRARY_SONG_ID_PREFIX)
}

export function isLocalLibrarySong(song: Pick<Song, 'id' | 'extra'> | null | undefined): boolean {
  if (!song) {
    return false
  }

  if (isLocalLibrarySongId(song.id)) {
    return true
  }

  const extra = song.extra
  if (!extra || typeof extra !== 'object') {
    return false
  }

  return (extra as Record<string, unknown>).localSource === true
}

export function hasKnownLocalSongDuration(
  song: Pick<Song, 'extra' | 'duration' | 'id'> | null | undefined
): boolean {
  if (!song || !isLocalLibrarySong(song)) {
    return false
  }

  if (song.duration > 0) {
    return true
  }

  const extra = song.extra
  if (!extra || typeof extra !== 'object') {
    return false
  }

  return (extra as Record<string, unknown>).localDurationKnown === true
}
