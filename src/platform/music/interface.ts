export interface Artist {
  id: string | number
  name: string
}

export interface Album {
  id: string | number
  name: string
  picUrl: string
}

export interface Song {
  id: string | number
  name: string
  artists: Artist[]
  album: Album
  duration: number
  mvid: string | number
  platform: 'netease' | 'qq'
  originalId: string | number
  extra?: Record<string, unknown>
  [key: string]: unknown
}

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

/** 歌曲 URL 获取选项 */
export interface SongUrlOptions {
  level?: 'standard' | 'higher' | 'exhigh' | 'lossless' | 'hires'
  br?: number
  /** QQ 音乐媒体 ID（用于获取播放链接） */
  mediaId?: string
}

/**
 * Music Platform Adapter Interface
 *
 * Defines the standard interface for music platform interactions.
 * All platform implementations (Netease, QQ, etc.) must extend this class.
 */
export abstract class MusicPlatformAdapter {
  platformId: string

  constructor(platformId: string) {
    this.platformId = platformId
  }

  /**
   * Search for songs
   * @param keyword
   * @param limit
   * @param page
   */
  abstract search(keyword: string, limit: number, page: number): Promise<SearchResult>

  /**
   * Get song playback URL
   * @param id Song ID
   * @param options Platform specific options (quality, etc.)
   */
  abstract getSongUrl(
    id: string | number,
    options?: SongUrlOptions | string
  ): Promise<string | null>

  /**
   * Get song details (including album art if missing)
   * @param id Song ID
   */
  abstract getSongDetail(id: string | number): Promise<Song | null>

  /**
   * Get lyric
   * @param id Song ID
   */
  abstract getLyric(id: string | number): Promise<LyricResult>

  /**
   * Get playlist details and tracks
   * @param id Playlist ID
   */
  abstract getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null>
}

/**
 * Standard Song Object Structure
 * Helper to normalize song data across platforms
 */
export function createSong(
  data: Partial<Song> & { id: string | number; name: string; platform: 'netease' | 'qq' }
): Song {
  return {
    id: data.id,
    name: data.name,
    artists: data.artists || [], // [{ id, name }]
    album: data.album || { id: 0, name: '', picUrl: '' }, // { id, name, picUrl }
    duration: data.duration || 0,
    mvid: data.mvid || 0,
    platform: data.platform,
    // Store original ID if platform uses complex IDs (like QQ's mid vs id)
    originalId: data.originalId || data.id,
    // Additional platform-specific data
    ...(data.extra ? { extra: data.extra } : {})
  }
}
