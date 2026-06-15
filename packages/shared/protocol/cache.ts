/**
 * Shared cache types and defaults across renderer/main/preload.
 */

/**
 * API 服务端口配置
 */
export const NETEASE_API_PORT = 14532
export const QQ_API_PORT = 3200

export const CACHE_DEFAULTS = {
  TTL: 5 * 60 * 1000,
  MAX_SIZE: 100,
  CLEANUP_INTERVAL: 60 * 1000
} as const

export const GATEWAY_CACHEABLE_ENDPOINTS = [
  'search',
  'lyric',
  'detail',
  'playlist',
  'album'
] as const

export type CacheClearOptions = {
  cookies?: boolean
  localStorage?: boolean
  sessionStorage?: boolean
  indexDB?: boolean
  webSQL?: boolean
  cache?: boolean
  nativeAudio?: boolean
  serviceWorkers?: boolean
  shaderCache?: boolean
  all?: boolean
}

export type CacheSize = {
  httpCache: number
  httpCacheFormatted: string
  quota?: number
  quotaFormatted?: string
  nativeAudioCache?: number
  nativeAudioCacheFormatted?: string
  totalCache?: number
  totalCacheFormatted?: string
  note?: string
}

export type CacheClearResult = {
  success: string[]
  failed: { type: string; error: string }[]
}
