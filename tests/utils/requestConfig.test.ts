import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  RequestConfig,
  getCacheConfig,
  getRetryConfig,
  getCancelConfig,
  updateConfig,
  resetConfig,
  exportConfig,
  importConfig
} from '../../src/utils/http/requestConfig'

describe('requestConfig', () => {
  // 每个测试前重置配置
  beforeEach(() => {
    resetConfig()
  })

  describe('default configuration', () => {
    it('should have cache configuration with correct defaults', () => {
      const config = getCacheConfig()
      expect(config.enabled).toBe(true)
      expect(config.ttl).toBe(5 * 60 * 1000) // 5 minutes
      expect(config.max_size).toBe(100)
      expect(config.methods).toEqual(['get'])
      expect(config.cleanup_interval).toBe(60 * 1000) // 1 minute
    })

    it('should have retry configuration with correct defaults', () => {
      const config = getRetryConfig()
      expect(config.enabled).toBe(true)
      expect(config.max_retries).toBe(3)
      expect(config.initial_delay).toBe(1000)
      expect(config.max_delay).toBe(10000)
      expect(config.backoff).toBe(2)
      expect(config.statuses).toEqual([null, 500, 502, 503, 504])
      expect(config.jitter).toBe(true)
    })

    it('should have cancel configuration with correct defaults', () => {
      const config = getCancelConfig()
      expect(config.enabled).toBe(true)
      expect(config.auto_cancel).toBe(true)
      expect(config.cancel_on_unmount).toBe(true)
    })

    it('should have timeout configuration', () => {
      expect(RequestConfig.timeout.default).toBe(30000)
      expect(RequestConfig.timeout.download).toBe(60000)
      expect(RequestConfig.timeout.upload).toBe(60000)
    })

    it('should have logging configuration', () => {
      expect(RequestConfig.logging.enabled).toBe(true)
      expect(RequestConfig.logging.level).toBe('warn')
      expect(RequestConfig.logging.log_request).toBe(true)
      expect(RequestConfig.logging.log_response).toBe(true)
      expect(RequestConfig.logging.log_error).toBe(true)
    })
  })

  describe('getCacheConfig', () => {
    it('should return a copy of cache config', () => {
      const config1 = getCacheConfig()
      const config2 = getCacheConfig()
      expect(config1).not.toBe(config2) // 不同的对象引用
      expect(config1).toEqual(config2) // 但内容相同
    })

    it('should not affect original config when modifying returned copy', () => {
      const config = getCacheConfig()
      config.enabled = false
      config.ttl = 999
      
      const freshConfig = getCacheConfig()
      expect(freshConfig.enabled).toBe(true)
      expect(freshConfig.ttl).toBe(5 * 60 * 1000)
    })
  })

  describe('getRetryConfig', () => {
    it('should return a copy of retry config', () => {
      const config1 = getRetryConfig()
      const config2 = getRetryConfig()
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('getCancelConfig', () => {
    it('should return a copy of cancel config', () => {
      const config1 = getCancelConfig()
      const config2 = getCancelConfig()
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('updateConfig', () => {
    it('should update cache config', () => {
      updateConfig('cache', { enabled: false, ttl: 10000 })
      const config = getCacheConfig()
      expect(config.enabled).toBe(false)
      expect(config.ttl).toBe(10000)
      // 其他字段保持不变
      expect(config.max_size).toBe(100)
    })

    it('should update retry config', () => {
      updateConfig('retry', { max_retries: 5, initial_delay: 2000 })
      const config = getRetryConfig()
      expect(config.max_retries).toBe(5)
      expect(config.initial_delay).toBe(2000)
    })

    it('should update cancel config', () => {
      updateConfig('cancel', { auto_cancel: false })
      const config = getCancelConfig()
      expect(config.auto_cancel).toBe(false)
    })

    it('should ignore invalid category', () => {
      // 不应抛出错误
      expect(() => updateConfig('invalid', {})).not.toThrow()
    })

    it('should update timeout config', () => {
      updateConfig('timeout', { default: 60000 })
      expect(RequestConfig.timeout.default).toBe(60000)
    })

    it('should update logging config', () => {
      updateConfig('logging', { level: 'debug' })
      expect(RequestConfig.logging.level).toBe('debug')
    })
  })

  describe('resetConfig', () => {
    it('should reset specific category to defaults', () => {
      updateConfig('cache', { enabled: false, ttl: 999 })
      resetConfig('cache')
      
      const config = getCacheConfig()
      expect(config.enabled).toBe(true)
      expect(config.ttl).toBe(5 * 60 * 1000)
    })

    it('should reset all config when category not specified', () => {
      updateConfig('cache', { enabled: false })
      updateConfig('retry', { max_retries: 10 })
      updateConfig('cancel', { auto_cancel: false })
      
      resetConfig()
      
      expect(getCacheConfig().enabled).toBe(true)
      expect(getRetryConfig().max_retries).toBe(3)
      expect(getCancelConfig().auto_cancel).toBe(true)
    })

    it('should handle invalid category gracefully', () => {
      // 不应抛出错误
      expect(() => resetConfig('invalid')).not.toThrow()
    })
  })

  describe('exportConfig', () => {
    it('should export a deep copy of entire config', () => {
      const exported = exportConfig()
      
      expect(exported).toHaveProperty('cache')
      expect(exported).toHaveProperty('retry')
      expect(exported).toHaveProperty('cancel')
      expect(exported).toHaveProperty('timeout')
      expect(exported).toHaveProperty('logging')
    })

    it('should not affect original config when modifying exported copy', () => {
      const exported = exportConfig()
      exported.cache.enabled = false
      exported.retry.max_retries = 100
      
      expect(getCacheConfig().enabled).toBe(true)
      expect(getRetryConfig().max_retries).toBe(3)
    })
  })

  describe('importConfig', () => {
    it('should import valid config', () => {
      const newConfig = {
        cache: { enabled: false, ttl: 9999, max_size: 50, methods: ['post'] as const, cleanup_interval: 5000 },
        retry: { enabled: false, max_retries: 1, initial_delay: 500, max_delay: 5000, backoff: 3, statuses: [500], jitter: false },
        cancel: { enabled: false, auto_cancel: false, cancel_on_unmount: false },
        timeout: { default: 10000, download: 30000, upload: 30000 },
        logging: { enabled: false, level: 'error' as const, log_request: false, log_response: false, log_error: false }
      }
      
      importConfig(newConfig)
      
      expect(getCacheConfig().enabled).toBe(false)
      expect(getCacheConfig().ttl).toBe(9999)
      expect(getRetryConfig().enabled).toBe(false)
      expect(getCancelConfig().enabled).toBe(false)
    })

    it('should ignore null config', () => {
      const originalCache = getCacheConfig().enabled
      importConfig(null)
      expect(getCacheConfig().enabled).toBe(originalCache)
    })

    it('should ignore non-object config', () => {
      const originalCache = getCacheConfig().enabled
      importConfig('invalid')
      importConfig(123)
      importConfig(undefined)
      expect(getCacheConfig().enabled).toBe(originalCache)
    })

    it('should merge partial config', () => {
      importConfig({
        cache: { enabled: false }
      })
      
      const cacheConfig = getCacheConfig()
      expect(cacheConfig.enabled).toBe(false)
      // 其他配置保持默认
      expect(cacheConfig.ttl).toBe(5 * 60 * 1000)
    })
  })
})
