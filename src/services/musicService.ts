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
    async search(
      platform: string,
      keyword: string,
      limit: number,
      page: number
    ): Promise<SearchResult> {
      const adapter = await resolveAdapter(platform)
      return adapter.search(keyword, limit, page)
    },

    async getSongUrl(
      platform: string,
      id: string | number,
      options?: SongUrlOptions | string
    ): Promise<string | null> {
      const adapter = await resolveAdapter(platform)
      return adapter.getSongUrl(id, options)
    },

    async getSongDetail(platform: string, id: string | number): Promise<Song | null> {
      const adapter = await resolveAdapter(platform)
      return adapter.getSongDetail(id)
    },

    async getLyric(platform: string, id: string | number): Promise<LyricResult> {
      const adapter = await resolveAdapter(platform)
      return adapter.getLyric(id)
    },

    async getPlaylistDetail(platform: string, id: string | number): Promise<PlaylistDetail | null> {
      const adapter = await resolveAdapter(platform)
      return adapter.getPlaylistDetail(id)
    }
  }
}
