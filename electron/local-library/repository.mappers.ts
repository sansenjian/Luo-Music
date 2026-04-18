import type { Song } from '@/types/schemas'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryFolder,
  LocalLibraryTrack
} from '@/types/localLibrary'

import { createLocalMediaUrl } from './protocol'
import { createAlbumId, createArtistId, createLocalSongArtists } from './repository.helpers'
import type { AlbumRow, ArtistRow, FolderListRow, FolderRow, TrackRow } from './repository.types'

function createTrackSong(row: TrackRow): Song {
  return {
    id: row.id,
    name: row.title,
    artists: createLocalSongArtists(row.artist),
    album: {
      id: createAlbumId(row.artist, row.album),
      name: row.album,
      picUrl: ''
    },
    duration: row.duration,
    mvid: 0,
    platform: 'local',
    originalId: row.id,
    url: createLocalMediaUrl(row.file_path),
    extra: {
      localSource: true,
      localFilePath: row.file_path,
      localAlbum: row.album,
      localCoverHash: row.cover_hash,
      localDurationKnown: row.duration > 0
    }
  }
}

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
    song: createTrackSong(row)
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
