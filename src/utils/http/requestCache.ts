import type { AxiosRequestConfig } from 'axios'
import { CACHE_DEFAULTS } from '../../../electron/shared/protocol/cache'
import { getCacheConfig } from './requestConfig'

export const AUTH_REQUEST_CACHE_NAMESPACE = 'auth'

const DEFAULT_CACHE_NAMESPACE = 'public'

export type CacheRequestConfig = AxiosRequestConfig & {
  cacheNamespace?: string
}

interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  lastAccessed: number
}

interface CacheStats {
  total: number
  valid: number
  expired: number
  maxSize: number
  ttl: number
}

const cache = new Map<string, CacheEntry>()

type CachePolicy = {
  ttl: number
  maxSize: number
  cleanupInterval: number
}

function getCachePolicy(): CachePolicy {
  const config = getCacheConfig()
  return {
    ttl: config.ttl ?? CACHE_DEFAULTS.TTL,
    maxSize: config.max_size ?? CACHE_DEFAULTS.MAX_SIZE,
    cleanupInterval: config.cleanup_interval ?? CACHE_DEFAULTS.CLEANUP_INTERVAL
  }
}

function generateCacheKey(config: CacheRequestConfig): string {
  const { url, method, params, data } = config
  const namespace = config.cacheNamespace || DEFAULT_CACHE_NAMESPACE
  return `ns:${namespace}:${method?.toUpperCase() || 'GET'}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`
}

function isCacheValid(cacheEntry: CacheEntry | undefined): cacheEntry is CacheEntry {
  if (!cacheEntry) return false
  const now = Date.now()
  return now - cacheEntry.timestamp < getCachePolicy().ttl
}

export function getCache<T = unknown>(config: CacheRequestConfig): T | null {
  const key = generateCacheKey(config)
  const cacheEntry = cache.get(key) as CacheEntry<T> | undefined

  if (isCacheValid(cacheEntry)) {
    cacheEntry.lastAccessed = Date.now()
    return cacheEntry.data
  }

  if (cacheEntry) {
    cache.delete(key)
  }

  return null
}

export function setCache<T = unknown>(config: CacheRequestConfig, data: T): void {
  const { maxSize } = getCachePolicy()
  const key = generateCacheKey(config)

  if (cache.size >= maxSize) {
    removeLeastRecentlyUsed()
  }

  const now = Date.now()
  cache.set(key, {
    data,
    timestamp: now,
    lastAccessed: now
  })
}

function removeLeastRecentlyUsed(): void {
  let oldestTime = Infinity
  let oldestKey: string | null = null

  for (const [key, entry] of cache.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed
      oldestKey = key
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey)
  }
}

export function cleanupExpiredCache(): void {
  const { ttl } = getCachePolicy()
  const now = Date.now()

  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp >= ttl) {
      cache.delete(key)
    }
  }
}

export function clearCache(): void {
  cache.clear()
}

export function clearCacheNamespace(namespace: string): void {
  if (!namespace) {
    return
  }

  const prefix = `ns:${namespace}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

export function clearCacheNamespaces(namespaces: string[]): void {
  for (const namespace of namespaces) {
    clearCacheNamespace(namespace)
  }
}

export function getCacheStats(): CacheStats {
  const { maxSize, ttl } = getCachePolicy()
  let validCount = 0
  let expiredCount = 0

  for (const entry of cache.values()) {
    if (isCacheValid(entry)) {
      validCount++
    } else {
      expiredCount++
    }
  }

  return {
    total: cache.size,
    valid: validCount,
    expired: expiredCount,
    maxSize,
    ttl
  }
}

export function deleteCacheByUrl(url: string): void {
  for (const key of cache.keys()) {
    if (key.includes(url)) {
      cache.delete(key)
    }
  }
}

export function prefetch<T = unknown>(config: CacheRequestConfig, data: T): void {
  setCache<T>(config, data)
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null
let isCleanupStarted = false

export function startCleanupTimer(): void {
  if (isCleanupStarted || cleanupInterval) {
    return
  }

  cleanupInterval = setInterval(cleanupExpiredCache, getCachePolicy().cleanupInterval)
  isCleanupStarted = true
}

export function stopCleanupTimer(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    isCleanupStarted = false
  }
}

startCleanupTimer()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', stopCleanupTimer)
}

export default {
  getCache,
  setCache,
  clearCache,
  clearCacheNamespace,
  clearCacheNamespaces,
  cleanupExpiredCache,
  getCacheStats,
  deleteCacheByUrl,
  prefetch,
  startCleanupTimer,
  stopCleanupTimer
}
