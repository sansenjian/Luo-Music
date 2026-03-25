/**
 * Shared Netease search constants used by both renderer and Electron processes.
 */

export const NETEASE_SEARCH_TYPES = {
  SONG: 1,
  ALBUM: 10,
  ARTIST: 100,
  PLAYLIST: 1000,
  USER: 1002
} as const

export const NETEASE_SEARCH_TYPE_MAP: Record<string, number> = {
  song: NETEASE_SEARCH_TYPES.SONG,
  album: NETEASE_SEARCH_TYPES.ALBUM,
  artist: NETEASE_SEARCH_TYPES.ARTIST,
  playlist: NETEASE_SEARCH_TYPES.PLAYLIST,
  user: NETEASE_SEARCH_TYPES.USER
} as const

export const DEFAULT_NETEASE_SEARCH_TYPE = NETEASE_SEARCH_TYPES.SONG

export function getNeteaseSearchType(type?: string): number {
  if (!type) return DEFAULT_NETEASE_SEARCH_TYPE
  return NETEASE_SEARCH_TYPE_MAP[type] ?? DEFAULT_NETEASE_SEARCH_TYPE
}
