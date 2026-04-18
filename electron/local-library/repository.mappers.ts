import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryTrack
} from '@/types/localLibrary'

import { createTrackSong } from './service.helpers'
import { createAlbumId, createArtistId } from './repository.helpers'
import type { AlbumRow, ArtistRow, FolderListRow, FolderRow, TrackRow } from './repository.types'

export function mapFolderRow(row: FolderRow): Omit<LocalLibraryFolder, 'songCount'> {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastScannedAt: row.last_scanned_at
  }
}

export function mapFolderListRow(row: FolderListRow): LocalLibraryFolder {
  return {
    ...mapFolderRow(row),
    songCount: row.song_count
  }
}

export function mapTrackRow(row: TrackRow): LocalLibraryTrack {
  return {
    id: row.id,
    folderId: row.folder_id,
    filePath: row.file_path,
    fileName: row.file_name,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    fileSize: row.file_size,
    modifiedAt: row.modified_at,
    coverHash: row.cover_hash ?? null,
    song: createTrackSong(
      row.id,
      row.title,
      row.artist,
      row.album,
      row.file_path,
      row.duration,
      row.cover_hash ?? null
    )
  }
}

export function toArtistSummary(row: ArtistRow): LocalLibraryArtistSummary {
  return {
    id: createArtistId(row.artist),
    name: row.artist,
    trackCount: row.track_count,
    totalDuration: row.total_duration ?? 0,
    coverHash: row.cover_hash ?? null
  }
}

export function toAlbumSummary(row: AlbumRow): LocalLibraryAlbumSummary {
  return {
    id: createAlbumId(row.artist, row.album),
    name: row.album,
    artist: row.artist,
    trackCount: row.track_count,
    totalDuration: row.total_duration ?? 0,
    coverHash: row.cover_hash ?? null
  }
}
