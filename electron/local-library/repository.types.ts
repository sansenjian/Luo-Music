import type { LocalLibraryFolder } from '@/types/localLibrary'

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

export type TrackRow = {
  id: string
  folder_id: string
  file_path: string
  file_name: string
  title: string
  artist: string
  album: string
  duration: number
  file_size: number
  modified_at: number
  cover_hash: string | null
}

export type FolderRow = {
  id: string
  path: string
  name: string
  enabled: number
  created_at: number
  last_scanned_at: number | null
}

export type FolderListRow = FolderRow & {
  song_count: number
}

export type ArtistRow = {
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}

export type AlbumRow = {
  album: string
  artist: string
  track_count: number
  total_duration: number | null
  cover_hash: string | null
}
