import { getMusicAdapter } from '@/platform/music'
import {
  getDefaultSearchPlatformId,
  getLoginCapablePlatformDescriptors,
  getPlatformCapabilities,
  getPlatformDescriptors,
  getSearchPlatformOptions
} from '@/platform/music/descriptors'
import type {
  LyricResult,
  PlaylistDetail,
  SearchResult,
  Song,
  SongUrlOptions
} from '@/platform/music/interface'
import type {
  PlatformBooleanCapability,
  PlatformCapabilities,
  PlatformDescriptor,
  PlatformOption
} from '@shared/types/platform'

export type MusicService = {
  getPlatformDescriptors(): PlatformDescriptor[]
  getLoginCapablePlatformDescriptors(): PlatformDescriptor[]
  getDefaultSearchPlatformId(): string
  getSearchPlatformOptions(): PlatformOption[]
  getPlatformCapabilities(platformId: string): PlatformCapabilities
  hasPlatformCapability(platformId: string, capability: PlatformBooleanCapability): boolean
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
  getPlatformDescriptors?: typeof getPlatformDescriptors
  getLoginCapablePlatformDescriptors?: typeof getLoginCapablePlatformDescriptors
  getDefaultSearchPlatformId?: typeof getDefaultSearchPlatformId
  getSearchPlatformOptions?: typeof getSearchPlatformOptions
  getPlatformCapabilities?: typeof getPlatformCapabilities
}

export function createMusicService(deps: MusicServiceDeps = {}): MusicService {
  const resolveAdapter = deps.resolveAdapter ?? getMusicAdapter
  const resolvePlatformDescriptors = deps.getPlatformDescriptors ?? getPlatformDescriptors
  const resolveLoginCapablePlatformDescriptors =
    deps.getLoginCapablePlatformDescriptors ?? getLoginCapablePlatformDescriptors
  const resolveDefaultSearchPlatformId =
    deps.getDefaultSearchPlatformId ?? getDefaultSearchPlatformId
  const resolveSearchPlatformOptions = deps.getSearchPlatformOptions ?? getSearchPlatformOptions
  const resolvePlatformCapabilities = deps.getPlatformCapabilities ?? getPlatformCapabilities

  return {
    getPlatformDescriptors(): PlatformDescriptor[] {
      return resolvePlatformDescriptors()
    },

    getLoginCapablePlatformDescriptors(): PlatformDescriptor[] {
      return resolveLoginCapablePlatformDescriptors()
    },

    getDefaultSearchPlatformId(): string {
      return resolveDefaultSearchPlatformId()
    },

    getSearchPlatformOptions(): PlatformOption[] {
      return resolveSearchPlatformOptions()
    },

    getPlatformCapabilities(platformId: string): PlatformCapabilities {
      return resolvePlatformCapabilities(platformId)
    },

    hasPlatformCapability(platformId: string, capability: PlatformBooleanCapability): boolean {
      return resolvePlatformCapabilities(platformId)[capability]
    },

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
