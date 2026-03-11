/**
 * 请求缓存模块
 * 实现 LRU (最近最少使用) 缓存策略
 * 用于缓存 GET 请求的响应数据，减少重复请求
 */

import type { AxiosRequestConfig } from 'axios'

// 缓存条目接口
interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  lastAccessed: number
}

// 缓存统计接口
interface CacheStats {
  total: number
  valid: number
  expired: number
  maxSize: number
  ttl: number
}

// 缓存配置
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000,    // 5 分钟缓存时间
  MAX_SIZE: 100,         // 最多 100 条记录
  CLEANUP_INTERVAL: 60 * 1000  // 1 分钟清理一次过期缓存
}

// 缓存存储
const cache = new Map<string, CacheEntry>()

/**
 * 生成缓存键
 * @param config - Axios 请求配置
 * @returns 缓存键
 */
function generateCacheKey(config: AxiosRequestConfig): string {
  const { url, method, params, data } = config
  return `${method?.toUpperCase() || 'GET'}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`
}

/**
 * 检查缓存是否有效
 * @param cacheEntry - 缓存条目
 * @returns 是否有效
 */
function isCacheValid(cacheEntry: CacheEntry | undefined): cacheEntry is CacheEntry {
  if (!cacheEntry) return false
  const now = Date.now()
  return (now - cacheEntry.timestamp) < CACHE_CONFIG.TTL
}

/**
 * 获取缓存
 * @param config - Axios 请求配置
 * @returns 缓存的数据，如果不存在或已过期则返回 null
 */
export function getCache<T = unknown>(config: AxiosRequestConfig): T | null {
  const key = generateCacheKey(config)
  const cacheEntry = cache.get(key) as CacheEntry<T> | undefined
  
  if (isCacheValid(cacheEntry)) {
    // 更新访问时间 (LRU 策略)
    cacheEntry.lastAccessed = Date.now()
    return cacheEntry.data
  }
  
  // 缓存已过期，删除
  if (cacheEntry) {
    cache.delete(key)
  }
  return null
}

/**
 * 设置缓存
 * @param config - Axios 请求配置
 * @param data - 要缓存的数据
 */
export function setCache<T = unknown>(config: AxiosRequestConfig, data: T): void {
  const key = generateCacheKey(config)
  
  // 如果缓存已满，删除最少使用的条目
  if (cache.size >= CACHE_CONFIG.MAX_SIZE) {
    removeLeastRecentlyUsed()
  }
  
  const now = Date.now()
  cache.set(key, {
    data,
    timestamp: now,
    lastAccessed: now
  })
}

/**
 * 删除最少使用的条目 (LRU 策略)
 */
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

/**
 * 清理过期缓存
 */
export function cleanupExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if ((now - entry.timestamp) >= CACHE_CONFIG.TTL) {
      cache.delete(key)
    }
  }
}

/**
 * 清空所有缓存
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * 获取缓存统计信息
 * @returns 缓存统计
 */
export function getCacheStats(): CacheStats {
  const now = Date.now()
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
    maxSize: CACHE_CONFIG.MAX_SIZE,
    ttl: CACHE_CONFIG.TTL
  }
}

/**
 * 删除指定 URL 的缓存
 * @param url - 要删除缓存的 URL
 */
export function deleteCacheByUrl(url: string): void {
  for (const key of cache.keys()) {
    if (key.includes(url)) {
      cache.delete(key)
    }
  }
}

/**
 * 预缓存数据
 * @param config - Axios 请求配置
 * @param data - 要预缓存的数据
 */
export function prefetch<T = unknown>(config: AxiosRequestConfig, data: T): void {
  setCache<T>(config, data)
}

// 启动定期清理任务
let cleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * 启动缓存清理定时器
 */
export function startCleanupTimer(): void {
  if (cleanupInterval) return
  cleanupInterval = setInterval(cleanupExpiredCache, CACHE_CONFIG.CLEANUP_INTERVAL)
}

/**
 * 停止缓存清理定时器
 */
export function stopCleanupTimer(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

// 自动启动清理定时器
startCleanupTimer()

// 页面卸载时清理定时器
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', stopCleanupTimer)
}

export default {
  getCache,
  setCache,
  clearCache,
  cleanupExpiredCache,
  getCacheStats,
  deleteCacheByUrl,
  prefetch,
  startCleanupTimer,
  stopCleanupTimer
}
