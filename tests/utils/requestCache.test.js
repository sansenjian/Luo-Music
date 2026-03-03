import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  getCache, 
  setCache, 
  clearCache, 
  cleanupExpiredCache,
  getCacheStats,
  deleteCacheByUrl,
  prefetch
} from '../../src/utils/requestCache'

describe('requestCache', () => {
  beforeEach(() => {
    clearCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCache()
  })

  const mockConfig = {
    method: 'get',
    url: '/api/test',
    params: { id: 1 }
  }

  const mockData = { result: 'test data' }

  describe('getCache & setCache', () => {
    it('应该能够设置和获取缓存', () => {
      setCache(mockConfig, mockData)
      const cached = getCache(mockConfig)
      expect(cached).toEqual(mockData)
    })

    it('不存在的缓存应该返回 null', () => {
      const cached = getCache(mockConfig)
      expect(cached).toBeNull()
    })

    it('应该使用 LRU 策略', () => {
      // 设置多个缓存
      for (let i = 0; i < 5; i++) {
        setCache(
          { method: 'get', url: `/api/test${i}`, params: {} },
          { data: i }
        )
      }

      // 访问第一个缓存 (使其成为最近使用)
      getCache({ method: 'get', url: '/api/test0', params: {} })

      // 等待缓存过期
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)

      // 过期的缓存应该被清理
      const cached = getCache({ method: 'get', url: '/api/test0', params: {} })
      expect(cached).toBeNull()
    })
  })

  describe('缓存过期', () => {
    it('缓存应该在 TTL 后过期', () => {
      setCache(mockConfig, mockData)
      
      // 前进 5 分钟 (TTL)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      
      const cached = getCache(mockConfig)
      expect(cached).toBeNull()
    })

    it('未过期的缓存应该正常返回', () => {
      setCache(mockConfig, mockData)
      
      // 前进 4 分钟
      vi.advanceTimersByTime(4 * 60 * 1000)
      
      const cached = getCache(mockConfig)
      expect(cached).toEqual(mockData)
    })

    it('应该能够清理过期缓存', () => {
      setCache(mockConfig, mockData)
      setCache(
        { method: 'get', url: '/api/test2', params: {} },
        { data: 'test2' }
      )
      
      // 前进 5 分钟
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      
      cleanupExpiredCache()
      
      const stats = getCacheStats()
      expect(stats.valid).toBe(0)
      expect(stats.expired).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('应该清空所有缓存', () => {
      setCache(mockConfig, mockData)
      setCache(
        { method: 'get', url: '/api/test2', params: {} },
        { data: 'test2' }
      )
      
      clearCache()
      
      const stats = getCacheStats()
      expect(stats.total).toBe(0)
    })
  })

  describe('getCacheStats', () => {
    it('应该返回正确的统计信息', () => {
      setCache(mockConfig, mockData)
      setCache(
        { method: 'get', url: '/api/test2', params: {} },
        { data: 'test2' }
      )
      
      const stats = getCacheStats()
      
      expect(stats.total).toBe(2)
      expect(stats.valid).toBe(2)
      expect(stats.expired).toBe(0)
      expect(stats.maxSize).toBe(100)
      expect(stats.ttl).toBe(5 * 60 * 1000)
    })
  })

  describe('deleteCacheByUrl', () => {
    it('应该删除指定 URL 的缓存', () => {
      setCache(mockConfig, mockData)
      setCache(
        { method: 'get', url: '/api/test2', params: {} },
        { data: 'test2' }
      )
      
      deleteCacheByUrl('/api/test')
      
      const stats = getCacheStats()
      expect(stats.total).toBe(0)
    })
  })

  describe('prefetch', () => {
    it('应该能够预缓存数据', () => {
      prefetch(mockConfig, mockData)
      
      const cached = getCache(mockConfig)
      expect(cached).toEqual(mockData)
    })
  })

  describe('缓存键生成', () => {
    it('相同配置应该生成相同的缓存键', () => {
      const config1 = { method: 'get', url: '/api/test', params: { id: 1 } }
      const config2 = { method: 'get', url: '/api/test', params: { id: 1 } }
      
      setCache(config1, mockData)
      const cached = getCache(config2)
      
      expect(cached).toEqual(mockData)
    })

    it('不同配置应该生成不同的缓存键', () => {
      const config1 = { method: 'get', url: '/api/test', params: { id: 1 } }
      const config2 = { method: 'get', url: '/api/test', params: { id: 2 } }
      
      setCache(config1, mockData)
      setCache(config2, { data: 'different' })
      
      const cached1 = getCache(config1)
      const cached2 = getCache(config2)
      
      expect(cached1).toEqual(mockData)
      expect(cached2).toEqual({ data: 'different' })
    })
  })

  describe('缓存大小限制', () => {
    it('应该遵守最大缓存数量限制', () => {
      // 设置超过最大限制的缓存
      for (let i = 0; i < 150; i++) {
        setCache(
          { method: 'get', url: `/api/test${i}`, params: { id: i } },
          { data: i }
        )
      }
      
      const stats = getCacheStats()
      expect(stats.total).toBeLessThanOrEqual(100)
    })
  })
})
