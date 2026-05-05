import type { LyricResult, PlaylistDetail, SearchResult, Song } from '@/platform/music/interface'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStandardId(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeDurationMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.round(value)
}

function normalizeStandardId(value: unknown, fallback: string | number): string | number {
  return isStandardId(value) ? value : fallback
}

function normalizeArtists(value: unknown, songId: string | number): Song['artists'] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isRecord).map((artist, index) => ({
    id: normalizeStandardId(artist.id, `${String(songId)}-artist-${index}`),
    name: normalizeText(artist.name)
  }))
}

function normalizeAlbum(value: unknown, songId: string | number): Song['album'] {
  if (!isRecord(value)) {
    return { id: `${String(songId)}-album`, name: '', picUrl: '' }
  }

  return {
    id: normalizeStandardId(value.id, `${String(songId)}-album`),
    name: normalizeText(value.name),
    picUrl: normalizeText(value.picUrl)
  }
}

export function normalizePluginSong(value: unknown, platformId: string): Song | null {
  if (!isRecord(value) || !isStandardId(value.id)) {
    return null
  }

  const song: Song = {
    id: value.id,
    name: normalizeText(value.name),
    artists: normalizeArtists(value.artists, value.id),
    album: normalizeAlbum(value.album, value.id),
    duration: normalizeDurationMs(value.duration),
    mvid: normalizeStandardId(value.mvid, 0),
    platform: platformId,
    originalId: normalizeStandardId(value.originalId, value.id)
  }

  if (isRecord(value.extra)) {
    song.extra = { ...value.extra }
  }

  if (typeof value.url === 'string' && value.url.length > 0) {
    song.url = value.url
  }

  if (isStandardId(value.mediaId)) {
    song.mediaId = value.mediaId
  }

  if (typeof value.retryCount === 'number' && Number.isFinite(value.retryCount)) {
    song.retryCount = Math.max(0, Math.round(value.retryCount))
  }

  if (typeof value.unavailable === 'boolean') {
    song.unavailable = value.unavailable
  }

  if (typeof value.errorMessage === 'string' || value.errorMessage === null) {
    song.errorMessage = value.errorMessage
  }

  return song
}

export function normalizePluginSearchResult(value: unknown, platformId: string): SearchResult {
  if (!isRecord(value)) {
    return { list: [], total: 0 }
  }

  const list = Array.isArray(value.list)
    ? value.list
        .map(item => normalizePluginSong(item, platformId))
        .filter((item): item is Song => item !== null)
    : []

  const total =
    typeof value.total === 'number' && Number.isFinite(value.total) && value.total >= 0
      ? Math.round(value.total)
      : list.length

  return { list, total }
}

export function normalizePluginPlaylistDetail(
  value: unknown,
  platformId: string
): PlaylistDetail | null {
  if (!isRecord(value) || !isStandardId(value.id)) {
    return null
  }

  const tracks = Array.isArray(value.tracks)
    ? value.tracks
        .map(item => normalizePluginSong(item, platformId))
        .filter((item): item is Song => item !== null)
    : []

  return {
    id: value.id,
    name: normalizeText(value.name),
    coverImgUrl: normalizeText(value.coverImgUrl),
    ...(normalizeOptionalText(value.description) !== undefined
      ? { description: normalizeOptionalText(value.description) }
      : {}),
    ...(typeof value.trackCount === 'number' && Number.isFinite(value.trackCount)
      ? { trackCount: Math.max(0, Math.round(value.trackCount)) }
      : {}),
    tracks
  }
}

export function normalizePluginLyricResult(value: unknown): LyricResult {
  if (!isRecord(value)) {
    return { lrc: '', tlyric: '', romalrc: '' }
  }

  return {
    lrc: normalizeText(value.lrc),
    tlyric: normalizeText(value.tlyric),
    romalrc: normalizeText(value.romalrc ?? value.rlyric)
  }
}

export function normalizePluginSongUrlResult(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null
  }

  if (value === null || value === undefined) {
    return null
  }

  if (isRecord(value) && (typeof value.url === 'string' || value.url === null)) {
    return value.url && value.url.length > 0 ? value.url : null
  }

  return null
}
