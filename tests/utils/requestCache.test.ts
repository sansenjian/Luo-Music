import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCache,
  clearCacheNamespaces,
  cleanupExpiredCache,
  deleteCacheByUrl,
  getCache,
  getCacheStats,
  prefetch,
  setCache,
  type CacheRequestConfig
} from '../../src/utils/http/requestCache'

describe('requestCache', () => {
  const mockConfig: CacheRequestConfig = {
    method: 'get',
    url: '/api/test',
    params: { id: 1 }
  }

  const mockData = { result: 'test data' }

  beforeEach(() => {
    clearCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCache()
  })

  it('stores and reads cache entries', () => {
    setCache(mockConfig, mockData)

    expect(getCache(mockConfig)).toEqual(mockData)
  })

  it('returns null for missing entries', () => {
    expect(getCache(mockConfig)).toBeNull()
  })

  it('expires cache by ttl', () => {
    setCache(mockConfig, mockData)

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(getCache(mockConfig)).toBeNull()
  })

  it('cleans up expired entries', () => {
    setCache(mockConfig, mockData)
    setCache({ method: 'get', url: '/api/test2' }, { result: 'another' })

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    cleanupExpiredCache()

    expect(getCacheStats().total).toBe(0)
  })

  it('clears all entries', () => {
    setCache(mockConfig, mockData)
    setCache({ method: 'get', url: '/api/test2' }, { result: 'another' })

    clearCache()

    expect(getCacheStats().total).toBe(0)
  })

  it('deletes entries by url fragment', () => {
    setCache({ method: 'get', url: '/api/test' }, { result: 1 })
    setCache({ method: 'get', url: '/api/other' }, { result: 2 })

    deleteCacheByUrl('/api/test')

    expect(getCache({ method: 'get', url: '/api/test' })).toBeNull()
    expect(getCache({ method: 'get', url: '/api/other' })).toEqual({ result: 2 })
  })

  it('prefetches data', () => {
    prefetch(mockConfig, mockData)

    expect(getCache(mockConfig)).toEqual(mockData)
  })

  it('evicts least recently used entries when cache is full', () => {
    for (let i = 0; i < 150; i++) {
      setCache({ method: 'get', url: `/api/item-${i}` }, { id: i })
    }

    expect(getCacheStats().total).toBeLessThanOrEqual(100)
  })

  it('returns cache stats with configured limits', () => {
    setCache(mockConfig, mockData)

    const stats = getCacheStats()

    expect(stats.total).toBe(1)
    expect(stats.valid).toBe(1)
    expect(stats.maxSize).toBe(100)
    expect(stats.ttl).toBe(5 * 60 * 1000)
  })

  it('clears only requested namespaces', () => {
    setCache({ method: 'get', url: '/api/auth', cacheNamespace: 'auth' }, { ok: 1 })
    setCache({ method: 'get', url: '/api/public', cacheNamespace: 'public' }, { ok: 2 })

    clearCacheNamespaces(['auth'])

    expect(getCache({ method: 'get', url: '/api/auth', cacheNamespace: 'auth' })).toBeNull()
    expect(getCache({ method: 'get', url: '/api/public', cacheNamespace: 'public' })).toEqual({
      ok: 2
    })
  })
})
