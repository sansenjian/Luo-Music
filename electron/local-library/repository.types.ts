import type {
  LocalLibraryDuplicateMode,
  LocalLibraryFolder,
  LocalLibraryMetadataCandidateField,
  LocalLibraryMetadataCandidateState,
  LocalLibraryMetadataFieldSource,
  LocalLibraryScanJobKind,
  LocalLibraryScanJobPhase
} from '@shared/types/localLibrary'

import type { Selectable } from 'kysely'

export type BetterSqlite3Database = import('better-sqlite3').Database
export type BetterSqlite3Statement = import('better-sqlite3').Statement
export type BetterSqlite3Constructor = new (
  filename: string,
  options?: {
    readonly?: boolean
    fileMustExist?: boolean
    timeout?: number
  }
) => BetterSqlite3Database

export type PersistedFolder = Omit<LocalLibraryFolder, 'songCount'>

export type LocalLibraryDatabase = {
  local_library_duplicate_groups: LocalLibraryDuplicateGroupTable
  local_library_duplicate_members: LocalLibraryDuplicateMemberTable
  local_library_folders: LocalLibraryFolderTable
  local_library_metadata_candidates: LocalLibraryMetadataCandidateTable
  local_library_scan_jobs: LocalLibraryScanJobTable
  local_library_tracks: LocalLibraryTrackTable
}

export type LocalLibraryFolderTable = {
  id: string
  path: string
  path_key: string
  name: string
  enabled: number
  created_at: number
  last_scanned_at: number | null
}

export type LocalLibraryTrackTable = {
  id: string
  folder_id: string
  file_path: string
  file_path_key: string
  file_name: string
  title: string
  artist: string
  album: string
  duration: number
  file_size: number
  modified_at: number
  first_seen_at: number
  cover_hash: string | null
  codec: string | null
  sample_rate: number | null
  bit_depth: number | null
  bitrate: number | null
  metadata_sources_json: string | null
}

export type LocalLibraryScanJobTable = {
  id: string
  kind: LocalLibraryScanJobKind
  phase: LocalLibraryScanJobPhase
  message: string
  folder_count: number
  scanned_folders: number
  scanned_files: number
  discovered_tracks: number
  error_message: string | null
  started_at: number
  finished_at: number | null
  updated_at: number
}

export type LocalLibraryMetadataCandidateTable = {
  id: string
  track_id: string
  field: LocalLibraryMetadataCandidateField
  source: LocalLibraryMetadataFieldSource
  current_value: string | null
  suggested_value: string | null
  confidence: number
  state: LocalLibraryMetadataCandidateState
  created_at: number
  updated_at: number
}

export type LocalLibraryDuplicateGroupTable = {
  id: string
  mode: LocalLibraryDuplicateMode
  duplicate_key: string
  representative_track_id: string
  track_count: number
  hidden_count: number
  confidence: number
  reasons_json: string
  created_at: number
  updated_at: number
}

export type LocalLibraryDuplicateMemberTable = {
  group_id: string
  track_id: string
  mode: LocalLibraryDuplicateMode
  quality_score: number
  rank: number
  hidden: number
  reasons_json: string
  created_at: number
  updated_at: number
}

export type TrackDuplicateMetadataRow = {
  duplicate_group_id: string | null
  duplicate_rank: number | null
  duplicate_hidden: number | null
  duplicate_quality_score: number | null
}

type TrackTechnicalMetadataRow = Pick<
  Selectable<LocalLibraryTrackTable>,
  'bit_depth' | 'bitrate' | 'codec' | 'first_seen_at' | 'sample_rate'
>

export type TrackRow = Omit<
  Selectable<LocalLibraryTrackTable>,
  | 'bit_depth'
  | 'bitrate'
  | 'codec'
  | 'file_path_key'
  | 'first_seen_at'
  | 'metadata_sources_json'
  | 'sample_rate'
> &
  Partial<TrackTechnicalMetadataRow> &
  Partial<Pick<Selectable<LocalLibraryTrackTable>, 'metadata_sources_json'>> &
  Partial<TrackDuplicateMetadataRow>

export type FolderRow = Omit<Selectable<LocalLibraryFolderTable>, 'path_key'>

export type FolderListRow = FolderRow & {
  song_count: number
}

export type ArtistRow = {
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}

export type ArtistSummarySourceRow = {
  artist: string
  duration: number
  cover_hash: string | null
}

export type AlbumRow = {
  album: string
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}

export type MetadataCandidateSummaryRow = {
  field: LocalLibraryMetadataCandidateField
  source: LocalLibraryMetadataFieldSource
  count: number
  updated_at: number | null
}
