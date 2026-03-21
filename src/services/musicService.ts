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

export function createMusicService(): MusicService {
  return {
    search(platform: string, keyword: string, limit: number, page: number): Promise<SearchResult> {
      return getMusicAdapter(platform).search(keyword, limit, page)
    },

    getSongUrl(
      platform: string,
      id: string | number,
      options?: SongUrlOptions | string
    ): Promise<string | null> {
      return getMusicAdapter(platform).getSongUrl(id, options)
    },

    getSongDetail(platform: string, id: string | number): Promise<Song | null> {
      return getMusicAdapter(platform).getSongDetail(id)
    },

    getLyric(platform: string, id: string | number): Promise<LyricResult> {
      return getMusicAdapter(platform).getLyric(id)
    },

    getPlaylistDetail(platform: string, id: string | number): Promise<PlaylistDetail | null> {
      return getMusicAdapter(platform).getPlaylistDetail(id)
    }
  }
}
