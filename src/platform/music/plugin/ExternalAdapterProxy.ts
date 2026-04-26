import type { PlatformCapabilities } from '@/platform/music/descriptors'
import {
  MusicPlatformAdapter,
  type LyricResult,
  type PlaylistDetail,
  type SearchResult,
  type Song,
  type SongUrlOptions
} from '@/platform/music/interface'

type PluginBridge = {
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
}

function resolvePluginBridge(): PluginBridge {
  if (typeof window === 'undefined') {
    throw new Error('External plugin adapters are only available in the renderer runtime')
  }

  const bridge = (window as Window & { services?: { plugins?: PluginBridge } }).services?.plugins
  if (!bridge) {
    throw new Error('Plugin bridge is unavailable in the current runtime')
  }

  return bridge
}

export class ExternalAdapterProxy extends MusicPlatformAdapter {
  constructor(
    platformId: string,
    private readonly capabilities: PlatformCapabilities
  ) {
    super(platformId)
  }

  private assertCapability(capability: keyof PlatformCapabilities, methodName: string): void {
    if (!this.capabilities[capability]) {
      throw new Error(`Music platform "${this.platformId}" does not support ${methodName}`)
    }
  }

  private call<T>(method: string, payload: unknown): Promise<T> {
    return resolvePluginBridge().call(this.platformId, method, payload) as Promise<T>
  }

  async search(keyword: string, limit: number, page: number): Promise<SearchResult> {
    this.assertCapability('search', 'search')
    return this.call<SearchResult>('search', { keyword, limit, page })
  }

  async getSongUrl(id: string | number, options?: SongUrlOptions | string): Promise<string | null> {
    this.assertCapability('songUrl', 'getSongUrl')
    return this.call<string | null>('getSongUrl', { id, options })
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    this.assertCapability('songDetail', 'getSongDetail')
    return this.call<Song | null>('getSongDetail', { id })
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    this.assertCapability('lyric', 'getLyric')
    return this.call<LyricResult>('getLyric', { id })
  }

  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    this.assertCapability('playlistDetail', 'getPlaylistDetail')
    return this.call<PlaylistDetail | null>('getPlaylistDetail', { id })
  }
}

export class ExternalAdapterProxyFactory {
  private readonly adapters = new Map<string, ExternalAdapterProxy>()

  get(platformId: string, capabilities: PlatformCapabilities): ExternalAdapterProxy {
    const existing = this.adapters.get(platformId)
    if (existing) {
      return existing
    }

    const adapter = new ExternalAdapterProxy(platformId, capabilities)
    this.adapters.set(platformId, adapter)
    return adapter
  }
}

export const externalAdapterProxyFactory = new ExternalAdapterProxyFactory()
