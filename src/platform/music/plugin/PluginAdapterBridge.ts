import { createPluginContext } from '../../../../packages/plugin-sdk/runtime'
import type {
  LyricInput,
  MusicPluginDefinition,
  MusicPluginInstance,
  PlaylistDetailInput,
  PluginContext,
  SearchInput,
  SongDetailInput,
  SongUrlInput
} from '../../../../packages/plugin-sdk'
import type { PlatformCapabilities } from '../descriptors'
import {
  MusicPlatformAdapter,
  type LyricResult,
  type PlaylistDetail,
  type SearchResult,
  type Song,
  type SongUrlOptions
} from '../interface'

export class PluginAdapterBridge extends MusicPlatformAdapter {
  constructor(
    platformId: string,
    private readonly handlers: MusicPluginInstance,
    private readonly capabilities: PlatformCapabilities
  ) {
    super(platformId)
  }

  private requireHandler<K extends keyof MusicPluginInstance>(
    handlerName: K,
    capability: keyof PlatformCapabilities
  ): NonNullable<MusicPluginInstance[K]> {
    const handler = this.handlers[handlerName]

    if (!this.capabilities[capability] || typeof handler !== 'function') {
      throw new Error(`Music platform "${this.platformId}" does not support ${String(handlerName)}`)
    }

    return handler as NonNullable<MusicPluginInstance[K]>
  }

  async search(keyword: string, limit: number, page: number): Promise<SearchResult> {
    const handler = this.requireHandler('search', 'search') as (
      input: SearchInput
    ) => Promise<SearchResult>

    return handler({ keyword, limit, page })
  }

  async getSongUrl(id: string | number, options?: SongUrlOptions | string): Promise<string | null> {
    const handler = this.requireHandler('getSongUrl', 'songUrl') as (
      input: SongUrlInput
    ) => Promise<string | null>

    return handler({ id, options })
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const handler = this.requireHandler('getSongDetail', 'songDetail') as (
      input: SongDetailInput
    ) => Promise<Song | null>

    return handler({ id })
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const handler = this.requireHandler('getLyric', 'lyric') as (
      input: LyricInput
    ) => Promise<LyricResult>

    return handler({ id })
  }

  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    const handler = this.requireHandler('getPlaylistDetail', 'playlistDetail') as (
      input: PlaylistDetailInput
    ) => Promise<PlaylistDetail | null>

    return handler({ id })
  }
}

export async function createPluginAdapterBridge(
  definition: MusicPluginDefinition,
  options: { context?: PluginContext } = {}
): Promise<PluginAdapterBridge> {
  const context = options.context ?? createPluginContext(definition.manifest.platformId)
  const instance = await definition.create(context)

  return new PluginAdapterBridge(
    definition.manifest.platformId,
    instance,
    definition.manifest.capabilities
  )
}
