import type { Song } from '@/platform/music/interface'
import type { LocalLibraryTrack } from '@shared/types/localLibrary'

const UNKNOWN_LOCAL_TITLE_TEXTS = new Set(['未知歌曲', '未知标题'])
const UNKNOWN_LOCAL_ARTIST_TEXTS = new Set(['未知艺术家'])

export function isLocalSong(song: Pick<Song, 'extra' | 'platform'>): boolean {
  return song.platform === 'local' || song.extra?.localSource === true
}

export function normalizeDisplayText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeLocalTitleText(value: unknown): string {
  const text = normalizeDisplayText(value)
  return isUnknownLocalTitle(text) ? '' : text
}

export function normalizeLocalArtistText(value: unknown): string {
  const text = normalizeDisplayText(value)
  return isUnknownLocalArtist(text) ? '' : text
}

export function isUnknownLocalTitle(value: string): boolean {
  return UNKNOWN_LOCAL_TITLE_TEXTS.has(value)
}

export function isUnknownLocalArtist(value: string): boolean {
  return UNKNOWN_LOCAL_ARTIST_TEXTS.has(value)
}

export function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/u, '')
}

export function getFileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/u).pop() ?? filePath
}

export function resolveLocalTrackName(track: LocalLibraryTrack): string {
  return (
    normalizeLocalTitleText(track.song.name) ||
    normalizeLocalTitleText(track.title) ||
    stripFileExtension(normalizeDisplayText(track.fileName)) ||
    '未知歌曲'
  )
}

export function resolveLocalTrackArtist(track: LocalLibraryTrack): string {
  return (
    track.song.artists
      .map(artist => normalizeDisplayText(artist.name))
      .filter(artistName => !isUnknownLocalArtist(artistName))
      .filter(Boolean)
      .join(' / ') ||
    normalizeLocalArtistText(track.artist) ||
    '未知艺术家'
  )
}

export function resolveLocalTrackAlbum(track: LocalLibraryTrack): string {
  return normalizeDisplayText(track.song.album.name) || normalizeDisplayText(track.album)
}

export function resolveLocalSongName(song: Song, artistText = ''): string {
  const songName = normalizeDisplayText(song.name)
  if (songName && !(isLocalSong(song) && isUnknownLocalTitle(songName))) {
    return songName
  }

  const localFilePath = normalizeDisplayText(song.extra?.localFilePath)
  if (localFilePath) {
    return stripFileExtension(getFileNameFromPath(localFilePath))
  }

  const normalizedArtistText = normalizeDisplayText(artistText)
  if (isLocalSong(song) && normalizedArtistText && !isUnknownLocalArtist(normalizedArtistText)) {
    return normalizedArtistText
  }

  return '未知歌曲'
}

export function shouldPromoteArtistTextToLocalTitle(
  song: Song,
  name: string,
  artistText: string
): boolean {
  const songName = normalizeDisplayText(song.name)
  return (
    isLocalSong(song) &&
    (!songName || isUnknownLocalTitle(songName)) &&
    name === normalizeDisplayText(artistText)
  )
}
