import { CACHE_DEFAULTS, GATEWAY_CACHEABLE_ENDPOINTS } from '../../shared/protocol/cache.ts'
import logger from '../../logger'

const CACHE_CONFIG = {
  TTL: CACHE_DEFAULTS.TTL,
  MAX_SIZE: CACHE_DEFAULTS.MAX_SIZE
}

const CACHEABLE_ENDPOINTS = new Set<string>(GATEWAY_CACHEABLE_ENDPOINTS)

const gatewayCache = new Map<
  string,
  {
    data: unknown
    timestamp: number
    lastAccessed: number
  }
>()

const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10000,
  BACKOFF_MULTIPLIER: 2
}

function generateCacheKey(
  service: string,
  endpoint: string,
  params: Record<string, unknown>
): string {
  return `${service}:${endpoint}:${JSON.stringify(params || {})}`
}

function isCacheValid(cacheEntry: { timestamp: number }): boolean {
  const now = Date.now()
  return now - cacheEntry.timestamp < CACHE_CONFIG.TTL
}

export function getCache(
  service: string,
  endpoint: string,
  params: Record<string, unknown>
): unknown | null {
  if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
    return null
  }

  const key = generateCacheKey(service, endpoint, params)
  const cacheEntry = gatewayCache.get(key)

  if (cacheEntry && isCacheValid(cacheEntry)) {
    cacheEntry.lastAccessed = Date.now()
    logger.info(`[Gateway Cache] HIT: ${key}`)
    return cacheEntry.data
  }

  if (cacheEntry) {
    gatewayCache.delete(key)
  }

  return null
}

export function setCache(
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  data: unknown
): void {
  if (!CACHEABLE_ENDPOINTS.has(endpoint)) {
    return
  }

  const key = generateCacheKey(service, endpoint, params)

  if (gatewayCache.size >= CACHE_CONFIG.MAX_SIZE) {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [k, v] of gatewayCache.entries()) {
      if (v.lastAccessed < oldestTime) {
        oldestTime = v.lastAccessed
        oldestKey = k
      }
    }

    if (oldestKey) {
      gatewayCache.delete(oldestKey)
    }
  }

  const now = Date.now()
  gatewayCache.set(key, {
    data,
    timestamp: now,
    lastAccessed: now
  })

  logger.info(`[Gateway Cache] SET: ${key}`)
}

export function clearGatewayCache(): void {
  gatewayCache.clear()
  logger.info('[Gateway Cache] Cleared')
}

export function getGatewayCacheStatus(): { size: number; maxSize: number; ttl: number } {
  return {
    size: gatewayCache.size,
    maxSize: CACHE_CONFIG.MAX_SIZE,
    ttl: CACHE_CONFIG.TTL
  }
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

  const err = error as Error & { code?: string }

  if (err.name === 'AbortError' || err.name === 'CanceledError') {
    return false
  }

  return (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ENOTFOUND' ||
    err.message?.includes('Network Error') ||
    err.message?.includes('timeout') ||
    err.message?.includes('Service is not available')
  )
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

