import type { Song } from '@/types/schemas'

export type { Song, Artist, Album, SongPlatform } from '@/types/schemas'

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

export abstract class MusicPlatformAdapter {
  platformId: string

  constructor(platformId: string) {
    this.platformId = platformId
  }

  abstract search(keyword: string, limit: number, page: number): Promise<SearchResult>

  abstract getSongUrl(
    id: string | number,
    options?: SongUrlOptions | string
  ): Promise<string | null>

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
