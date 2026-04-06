import { getMusicAdapter } from '../platform/music'
import type {
  LyricResult,
  PlaylistDetail,
  SearchResult,
  Song,
  SongUrlOptions
} from '../platform/music/interface'

export type MusicService = {
  search(platform: string, keyword: string, limit: number, page: number): Promise<SearchResult>
  getSongUrl(
    platform: string,
    id: string | number,
    options?: SongUrlOptions | string
  ): Promise<string | null>
  getSongDetail(platform: string, id: string | number): Promise<Song | null>
  getLyric(platform: string, id: string | number): Promise<LyricResult>
  getPlaylistDetail(platform: string, id: string | number): Promise<PlaylistDetail | null>
}

type ResolveMusicAdapter = typeof getMusicAdapter

export type MusicServiceDeps = {
  resolveAdapter?: ResolveMusicAdapter
}

export function createMusicService(deps: MusicServiceDeps = {}): MusicService {
  const resolveAdapter = deps.resolveAdapter ?? getMusicAdapter

  return {
    search(platform: string, keyword: string, limit: number, page: number): Promise<SearchResult> {
      return resolveAdapter(platform).search(keyword, limit, page)
    },

    getSongUrl(
      platform: string,
      id: string | number,
      options?: SongUrlOptions | string
    ): Promise<string | null> {
      return resolveAdapter(platform).getSongUrl(id, options)
    },

    getSongDetail(platform: string, id: string | number): Promise<Song | null> {
      return resolveAdapter(platform).getSongDetail(id)
    },

    getLyric(platform: string, id: string | number): Promise<LyricResult> {
      return resolveAdapter(platform).getLyric(id)
    },

    getPlaylistDetail(platform: string, id: string | number): Promise<PlaylistDetail | null> {
      return resolveAdapter(platform).getPlaylistDetail(id)
    }
  }
}
