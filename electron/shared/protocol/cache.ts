/**
 * Shared cache types and defaults across renderer/main/preload.
 */

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
  serviceWorkers?: boolean
  shaderCache?: boolean
  all?: boolean
}

export type CacheClearResult = {
  success: string[]
  failed: { type: string; error: string }[]
}
