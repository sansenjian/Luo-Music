import { LRUCache } from 'lru-cache'
import { Mutex } from 'async-mutex'
import { CACHE_DEFAULTS, GATEWAY_CACHEABLE_ENDPOINTS } from '../../shared/protocol/cache.ts'
import logger from '../../logger'
import { HTTP_DEFAULT_RETRY_COUNT, HTTP_DEFAULT_RETRY_DELAY } from '../../../src/constants/http'

const CACHE_CONFIG = {
  TTL: CACHE_DEFAULTS.TTL,
  MAX_SIZE: CACHE_DEFAULTS.MAX_SIZE
}

const CACHEABLE_ENDPOINTS = new Set<string>(GATEWAY_CACHEABLE_ENDPOINTS)

/**
 * 使用 LRUCache 替换原生 Map，提供 O(1) 性能和内置 TTL 支持
 */
const gatewayCache = new LRUCache<string, { data: unknown; timestamp: number }>({
  max: CACHE_CONFIG.MAX_SIZE,
  ttl: CACHE_CONFIG.TTL,
  updateAgeOnGet: true, // 访问时更新过期时间
  allowStale: false, // 不返回过期数据
  dispose: (value, key) => {
    logger.debug(`[Gateway Cache] DISPOSED: ${key}`)
  }
})

/**
 * 缓存操作互斥锁，防止并发竞态条件
 */
const cacheMutex = new Mutex()

const RETRY_CONFIG = {
  MAX_RETRIES: HTTP_DEFAULT_RETRY_COUNT,
  INITIAL_DELAY: HTTP_DEFAULT_RETRY_DELAY,
  MAX_DELAY: 10000,
  BACKOFF_MULTIPLIER: 2
}

const RETRYABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND'])
const RETRYABLE_RESPONSE_STATUSES = new Set([408, 429, 502, 503, 504])
const RETRYABLE_MESSAGE_PATTERNS = [
  /\bNetwork Error\b/i,
  /\bRequest timeout\b/i,
  /\btimeout of \d+ms exceeded\b/i,
  /\btimed out\b/i,
  /\bService .* not available\b/i,
  /\bsocket hang up\b/i
]

/**
 * 生成稳定的缓存键 - 对参数进行排序确保一致性
 */
function generateCacheKey(
  service: string,
  endpoint: string,
  params: Record<string, unknown>
): string {
  // 对参数键进行排序，确保相同参数生成相同键
  const sortedParams = Object.keys(params || {})
    .sort()
    .reduce(
      (acc, key) => {
        const value = params[key]
        if (value !== undefined) {
          acc[key] = value
        }
        return acc
      },
      {} as Record<string, unknown>
    )

  const key = `${service}:${endpoint}:${JSON.stringify(sortedParams)}`

  // 限制键长度，避免极长键名占用内存
  if (key.length > 256) {
    const hash = key
      .split('')
      .reduce((h, c) => {
        return ((h << 5) - h + c.charCodeAt(0)) | 0
      }, 0)
      .toString(16)
    return `${service}:${endpoint}:<hash:${hash}>`
  }

  return key
}

/**
 * 获取缓存 - 线程安全的读取操作
 */
export function getCache(
  service: string,
  endpoint: string,
  params: Record<string, unknown>
): unknown | null {
  if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
    return null
  }

  const key = generateCacheKey(service, endpoint, params)

  // LRUCache 的 get 操作是原子的，无需加锁
  const cacheEntry = gatewayCache.get(key)

  if (cacheEntry) {
    logger.info(`[Gateway Cache] HIT: ${key}`)
    return cacheEntry.data
  }

  return null
}

/**
 * 设置缓存 - 线程安全的写入操作，使用互斥锁防止竞态条件
 */
export async function setCache(
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  data: unknown
): Promise<void> {
  if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
    return
  }

  const key = generateCacheKey(service, endpoint, params)

  // 使用互斥锁保护写入操作，防止并发竞态条件
  await cacheMutex.runExclusive(() => {
    const now = Date.now()
    gatewayCache.set(key, {
      data,
      timestamp: now
    })

    logger.info(`[Gateway Cache] SET: ${key}`)
  })
}

/**
 * 同步设置缓存 - 用于非异步上下文
 */
export function setCacheSync(
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  data: unknown
): void {
  if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
    return
  }

  const key = generateCacheKey(service, endpoint, params)
  const now = Date.now()

  gatewayCache.set(key, {
    data,
    timestamp: now
  })

  logger.info(`[Gateway Cache] SET: ${key}`)
}

/**
 * 清除所有缓存
 */
export function clearGatewayCache(): void {
  gatewayCache.clear()
  logger.info('[Gateway Cache] Cleared')
}

/**
 * 获取缓存状态
 */
export function getGatewayCacheStatus(): { size: number; maxSize: number; ttl: number } {
  return {
    size: gatewayCache.size,
    maxSize: CACHE_CONFIG.MAX_SIZE,
    ttl: CACHE_CONFIG.TTL
  }
}

/**
 * 按服务清除缓存
 */
export function clearCacheByService(service: string): number {
  let count = 0
  for (const key of gatewayCache.keys()) {
    if (key.startsWith(`${service}:`)) {
      gatewayCache.delete(key)
      count++
    }
  }
  logger.info(`[Gateway Cache] Cleared ${count} entries for service: ${service}`)
  return count
}

function calculateRetryDelay(retryCount: number): number {
  const exponentialDelay =
    RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount - 1)
  const jitter = Math.random() * 1000
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.MAX_DELAY)
}

function shouldRetry(error: unknown, retryCount: number): boolean {
  if (retryCount >= RETRY_CONFIG.MAX_RETRIES || !error) {
    return false
  }

  const err = error as Error & {
    code?: string
    response?: {
      status?: number
    }
  }

  if (err.name === 'AbortError' || err.name === 'CanceledError') {
    return false
  }

  if (typeof err.code === 'string' && RETRYABLE_ERROR_CODES.has(err.code)) {
    return true
  }

  if (err.code === 'LOCAL_SERVICE_TIMEOUT') {
    return false
  }

  if (typeof err.response?.status === 'number') {
    return RETRYABLE_RESPONSE_STATUSES.has(err.response.status)
  }

  const message = typeof err.message === 'string' ? err.message : ''
  return RETRYABLE_MESSAGE_PATTERNS.some(pattern => pattern.test(message))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function executeWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown

  for (let retryCount = 0; retryCount <= RETRY_CONFIG.MAX_RETRIES; retryCount++) {
    try {
      if (retryCount > 0) {
        const delayTime = calculateRetryDelay(retryCount)
        logger.warn(`[Retry] ${context} - retry ${retryCount}, delay ${Math.round(delayTime)}ms`)
        await delay(delayTime)
      }

      return await fn()
    } catch (error) {
      lastError = error

      if (!shouldRetry(error, retryCount)) {
        throw error
      }

      if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
        logger.error(`[Retry] ${context} - failed after ${RETRY_CONFIG.MAX_RETRIES} retries`)
        throw error
      }

      logger.warn(`[Retry] ${context} - will retry: ${(error as Error).message}`)
    }
  }

  throw lastError
}
