/**
 * API 服务代理 - 渲染进程的音乐 API 调用层
 *
 * 功能：
 * 1. 封装音乐平台 API 调用
 * 2. 统一错误处理
 * 3. 类型安全的请求接口
 */

// 导入服务代理
import { getIpcProxy } from './ipcProxy'
import { INVOKE_CHANNELS } from '../../shared/protocol/channels'

/**
 * 音乐平台类型
 */
export type MusicPlatform = 'netease' | 'qq'

/**
 * 搜索类型
 */
export type SearchType = 'song' | 'artist' | 'album' | 'playlist' | 'user'

/**
 * 搜索结果
 */
export interface SearchResult {
  songs?: unknown[]
  artists?: unknown[]
  albums?: unknown[]
  playlists?: unknown[]
  total: number
}

/**
 * 歌曲 URL 请求参数
 */
export interface SongUrlParams {
  id: string
  platform?: MusicPlatform
}

/**
 * 歌词请求参数
 */
export interface LyricParams {
  id: string
  platform?: MusicPlatform
}

/**
 * 歌词响应
 */
export interface LyricResponse {
  lyric: string
  translated?: string
}

/**
 * 详情请求参数
 */
export interface DetailParams {
  id: string
  platform?: MusicPlatform
}

/**
 * API 服务代理类
 *
 * 用法：
 * ```typescript
 * const apiProxy = new ApiProxy()
 *
 * // 搜索歌曲
 * const result = await apiProxy.search('周杰伦', 'song', 'qq')
 *
 * // 获取歌曲 URL
 * const url = await apiProxy.getSongUrl({ id: '123', platform: 'netease' })
 *
 * // 获取歌词
 * const lyric = await apiProxy.getLyric({ id: '123' })
 * ```
 */
export class ApiProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>

  constructor() {
    this.ipcProxy = getIpcProxy()
  }

  /**
   * 搜索音乐
   *
   * @param keyword - 搜索关键词
   * @param type - 搜索类型
   * @param platform - 音乐平台
   * @param page - 页码
   * @param limit - 每页数量
   * @returns 搜索结果
   */
  async search(
    keyword: string,
    type: SearchType = 'song',
    platform: MusicPlatform = 'netease',
    page = 1,
    limit = 30
  ): Promise<SearchResult> {
    return this.ipcProxy.invoke<SearchResult>(INVOKE_CHANNELS.API_SEARCH, {
      keyword,
      type,
      platform,
      page,
      limit
    })
  }

  /**
   * 获取歌曲播放 URL
   *
   * @param params - 参数
   * @returns 歌曲 URL
   */
  async getSongUrl(params: SongUrlParams): Promise<string> {
    const result = await this.ipcProxy.invoke<{ url: string }>(
      INVOKE_CHANNELS.API_GET_SONG_URL,
      params
    )
    return result.url
  }

  /**
   * 获取歌词
   *
   * @param params - 参数
   * @returns 歌词内容
   */
  async getLyric(params: LyricParams): Promise<LyricResponse> {
    return this.ipcProxy.invoke<LyricResponse>(INVOKE_CHANNELS.API_GET_LYRIC, params)
  }

  /**
   * 获取歌曲详情
   *
   * @param params - 参数
   * @returns 歌曲详情
   */
  async getSongDetail(params: DetailParams): Promise<unknown> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_SONG_DETAIL, params)
  }

  /**
   * 获取歌单详情
   *
   * @param id - 歌单 ID
   * @param platform - 音乐平台
   * @returns 歌单详情
   */
  async getPlaylistDetail(id: string, platform: MusicPlatform = 'netease'): Promise<unknown> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_PLAYLIST_DETAIL, { id, platform })
  }

  /**
   * 获取歌手详情
   *
   * @param id - 歌手 ID
   * @param platform - 音乐平台
   * @returns 歌手详情
   */
  async getArtistDetail(id: string, platform: MusicPlatform = 'netease'): Promise<unknown> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_ARTIST_DETAIL, { id, platform })
  }

  /**
   * 获取专辑详情
   *
   * @param id - 专辑 ID
   * @param platform - 音乐平台
   * @returns 专辑详情
   */
  async getAlbumDetail(id: string, platform: MusicPlatform = 'netease'): Promise<unknown> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_ALBUM_DETAIL, { id, platform })
  }

  /**
   * 获取推荐歌单
   *
   * @param platform - 音乐平台
   * @param limit - 数量
   * @returns 推荐歌单列表
   */
  async getRecommendedPlaylists(
    platform: MusicPlatform = 'netease',
    limit = 30
  ): Promise<unknown[]> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_RECOMMENDED_PLAYLISTS, { platform, limit })
  }

  /**
   * 获取排行榜
   *
   * @param platform - 音乐平台
   * @param id - 排行榜 ID
   * @returns 排行榜歌曲列表
   */
  async getChart(platform: MusicPlatform = 'netease', id?: string): Promise<unknown[]> {
    return this.ipcProxy.invoke(INVOKE_CHANNELS.API_GET_CHART, { platform, id })
  }
}

/**
 * 全局 API 代理实例
 */
let globalApiProxy: ApiProxy | null = null

/**
 * 获取全局 API 代理
 */
export function getApiProxy(): ApiProxy {
  if (!globalApiProxy) {
    globalApiProxy = new ApiProxy()
  }
  return globalApiProxy
}
