/**
 * 网易云音乐 API 常量定义
 *
 * 统一管理网易云音乐 API 相关的常量，如搜索类型、接口参数等
 */

/**
 * 网易云音乐搜索类型
 *
 * 对应网易云云音乐搜索接口的 type 参数：
 * - 1: 单曲
 * - 10: 专辑
 * - 100: 歌手
 * - 1000: 歌单
 * - 1002: 用户
 */
export const NETEASE_SEARCH_TYPES = {
  /** 单曲 */
  SONG: 1,
  /** 专辑 */
  ALBUM: 10,
  /** 歌手 */
  ARTIST: 100,
  /** 歌单 */
  PLAYLIST: 1000,
  /** 用户 */
  USER: 1002
} as const

/**
 * 搜索类型字符串映射到网易云 API 数值
 */
export const NETEASE_SEARCH_TYPE_MAP: Record<string, number> = {
  song: NETEASE_SEARCH_TYPES.SONG,
  album: NETEASE_SEARCH_TYPES.ALBUM,
  artist: NETEASE_SEARCH_TYPES.ARTIST,
  playlist: NETEASE_SEARCH_TYPES.PLAYLIST,
  user: NETEASE_SEARCH_TYPES.USER
} as const

/**
 * 默认搜索类型 (单曲)
 */
export const DEFAULT_NETEASE_SEARCH_TYPE = NETEASE_SEARCH_TYPES.SONG

/**
 * 根据搜索类型字符串获取对应的 API 数值
 * @param type - 搜索类型字符串
 * @returns 网易云 API 搜索类型数值
 */
export function getNeteaseSearchType(type?: string): number {
  if (!type) return DEFAULT_NETEASE_SEARCH_TYPE
  return NETEASE_SEARCH_TYPE_MAP[type] ?? DEFAULT_NETEASE_SEARCH_TYPE
}
