import type { Song } from './schemas'

export const LOCAL_LIBRARY_SONG_ID_PREFIX = 'local:'
export const LOCAL_LIBRARY_DEFAULT_PAGE_SIZE = 60
export const LOCAL_LIBRARY_INBOX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
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
  firstSeenAt?: number
  coverHash: string | null
  codec?: string | null
  sampleRate?: number | null
  bitDepth?: number | null
  bitrate?: number | null
  duplicateGroupId?: string | null
  duplicateRank?: number | null
  duplicateHidden?: boolean
  duplicateQualityScore?: number | null
  metadataSources?: LocalLibraryTrackMetadataSources
  song: Song
}

export type LocalLibraryMetadataFieldSource =
  | 'embedded'
  | 'filename'
  | 'folder'
  | 'network'
  | 'unknown'

export type LocalLibraryMetadataCandidateField =
  | 'title'
  | 'artist'
  | 'album'
  | 'duration'
  | 'cover'
  | 'technical'

export type LocalLibraryMetadataCandidateState = 'pending' | 'accepted' | 'rejected'

export type LocalLibraryMetadataCandidate = {
  id: string
  trackId: string
  field: LocalLibraryMetadataCandidateField
  source: LocalLibraryMetadataFieldSource
  currentValue: string | null
  suggestedValue: string | null
  confidence: number
  state: LocalLibraryMetadataCandidateState
  createdAt: number
  updatedAt: number
}

export type LocalLibraryTrackMetadataSources = {
  title: LocalLibraryMetadataFieldSource
  artist: LocalLibraryMetadataFieldSource
  album: LocalLibraryMetadataFieldSource
  duration: LocalLibraryMetadataFieldSource
  cover: LocalLibraryMetadataFieldSource
  technical: LocalLibraryMetadataFieldSource
}

export type LocalLibraryCoverSize = 'thumb' | 'album' | 'large'

export type LocalLibraryDuplicateMode = 'strict' | 'fuzzy'

export type LocalLibraryNetworkMetadataProvider = 'netease' | 'qq' | 'plugin' | 'unknown'

export type LocalLibraryNetworkMetadataCandidateInput = {
  provider?: LocalLibraryNetworkMetadataProvider
  title?: string | null
  artist?: string | null
  album?: string | null
  duration?: number | null
  coverUrl?: string | null
}

export type LocalLibraryNetworkMetadataSuggestion = {
  field: LocalLibraryMetadataCandidateField
  currentValue: string | null
  suggestedValue: string
  confidence: number
}

export type LocalLibraryNetworkMetadataCandidateScore = {
  provider: LocalLibraryNetworkMetadataProvider
  confidence: number
  matchScore: number
  reasons: string[]
  suggestions: LocalLibraryNetworkMetadataSuggestion[]
}

export type LocalLibraryDuplicateSummary = {
  mode: LocalLibraryDuplicateMode
  groupCount: number
  duplicateTrackCount: number
  hiddenTrackCount: number
  updatedAt: number | null
}

export type LocalLibraryHealthSummary = {
  trackCount: number
  folderCount: number
  enabledFolderCount: number
  inboxTrackCount: number
  missingCoverCount: number
  missingDurationCount: number
  missingTechnicalMetadataCount: number
  duplicateGroupCount: number
  duplicateTrackCount: number
  hiddenDuplicateTrackCount: number
  staleTrackCount: number
  updatedAt: number
}

export type LocalLibraryMetadataCandidateSummary = {
  pendingCount: number
  byField: Record<LocalLibraryMetadataCandidateField, number>
  bySource: Partial<Record<LocalLibraryMetadataFieldSource, number>>
  updatedAt: number | null
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

export type LocalLibraryViewMode = 'songs' | 'inbox' | 'artists' | 'albums'

export type LocalLibraryCursor = string | null

export type LocalLibraryTrackQuery = {
  cursor?: LocalLibraryCursor
  limit?: number
  search?: string
  folderId?: string | null
  artist?: string | null
  album?: string | null
  hideDuplicates?: boolean
  showDuplicatesOnly?: boolean
  duplicateMode?: LocalLibraryDuplicateMode
  recentlyAddedOnly?: boolean
  recentlyAddedSince?: number
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
export type LocalLibraryScanJobPhase = 'queued' | 'scanning' | 'completed' | 'failed' | 'cancelled'
export type LocalLibraryScanJobKind = 'full' | 'folder' | 'incremental'

export type LocalLibraryScanJob = {
  id: string
  kind: LocalLibraryScanJobKind
  phase: LocalLibraryScanJobPhase
  message: string
  folderCount: number
  scannedFolders: number
  scannedFiles: number
  discoveredTracks: number
  errorMessage: string | null
  startedAt: number
  finishedAt: number | null
  updatedAt: number
}

export type LocalLibraryScanStatus = {
  phase: LocalLibraryScanPhase
  scanJobId?: string | null
  scanJobKind?: LocalLibraryScanJobKind | null
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
  latestScanJob?: LocalLibraryScanJob | null
  health?: LocalLibraryHealthSummary
  metadataCandidateSummary?: LocalLibraryMetadataCandidateSummary
}

export function createEmptyLocalLibraryHealthSummary(): LocalLibraryHealthSummary {
  return {
    trackCount: 0,
    folderCount: 0,
    enabledFolderCount: 0,
    inboxTrackCount: 0,
    missingCoverCount: 0,
    missingDurationCount: 0,
    missingTechnicalMetadataCount: 0,
    duplicateGroupCount: 0,
    duplicateTrackCount: 0,
    hiddenDuplicateTrackCount: 0,
    staleTrackCount: 0,
    updatedAt: Date.now()
  }
}

export function createEmptyLocalLibraryMetadataCandidateSummary(): LocalLibraryMetadataCandidateSummary {
  return {
    pendingCount: 0,
    byField: {
      title: 0,
      artist: 0,
      album: 0,
      duration: 0,
      cover: 0,
      technical: 0
    },
    bySource: {},
    updatedAt: null
  }
}

export function createLocalLibraryScanStatus(
  status: Partial<LocalLibraryScanStatus> = {}
): LocalLibraryScanStatus {
  return {
    phase: 'idle',
    scanJobId: null,
    scanJobKind: null,
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
    health: createEmptyLocalLibraryHealthSummary(),
    metadataCandidateSummary: createEmptyLocalLibraryMetadataCandidateSummary(),
    latestScanJob: null,
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
