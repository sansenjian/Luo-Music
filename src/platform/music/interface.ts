import type { Song } from '@shared/types/schemas'

export type { Song, Artist, Album, SongPlatform } from '@shared/types/schemas'

export interface PlaylistDetail {
  id: string | number
  name: string
  coverImgUrl: string
  description?: string
  trackCount?: number
  tracks: Song[]
}

export interface SearchResult {
  list: Song[]
  total: number
}

export interface LyricResult {
  lrc: string
  tlyric: string
  romalrc: string
}

export interface SongUrlOptions {
  level?: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'
  br?: number
  mediaId?: string
}

export type SongUrlHeaders = Record<string, string>

export type SongUrlResult =
  | string
  | {
      url: string
      headers?: SongUrlHeaders
      mediaId?: string | number
      expiresAt?: number
      level?: string
      bitrate?: number
    }

export function getSongUrlValue(result: SongUrlResult | null | undefined): string | null {
  if (typeof result === 'string') {
    return result.length > 0 ? result : null
  }

  if (!result || typeof result.url !== 'string') {
    return null
  }

  return result.url.length > 0 ? result.url : null
}

export function getSongUrlHeaders(
  result: SongUrlResult | null | undefined
): SongUrlHeaders | undefined {
  if (typeof result !== 'object' || result === null || !result.headers) {
    return undefined
  }

  const headers = Object.fromEntries(
    Object.entries(result.headers).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' &&
        entry[0].trim().length > 0 &&
        typeof entry[1] === 'string' &&
        entry[1].trim().length > 0
    )
  )

  return Object.keys(headers).length > 0 ? headers : undefined
}

export abstract class MusicPlatformAdapter {
  platformId: string

  constructor(platformId: string) {
    this.platformId = platformId
  }

  abstract search(keyword: string, limit: number, page: number): Promise<SearchResult>

  abstract getSongUrl(
    id: string | number,
    options?: SongUrlOptions | string
  ): Promise<SongUrlResult | null>

  abstract getSongDetail(id: string | number): Promise<Song | null>

  abstract getLyric(id: string | number): Promise<LyricResult>

  abstract getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null>
}

export function createSong(
  data: Partial<Song> & { id: string | number; name: string; platform: string }
): Song {
  return {
    id: data.id,
    name: data.name,
    artists: data.artists || [],
    album: data.album || { id: 0, name: '', picUrl: '' },
    duration: data.duration || 0,
    mvid: data.mvid || 0,
    platform: data.platform,
    originalId: data.originalId || data.id,
    ...(data.extra ? { extra: data.extra } : {})
  }
}
