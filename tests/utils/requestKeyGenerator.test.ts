import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateRequestKey,
  generateCacheKey,
  parseRequestKey,
  isSameRequest,
  generateRequestKeys
} from '@/utils/http/requestKeyGenerator'

interface RequestConfig {
  url: string
  method?: string
  params?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
}

describe('requestKeyGenerator', () => {
  describe('generateRequestKey', () => {
    it('should generate key with all config fields', () => {
      const config: RequestConfig = {
        url: '/api/songs',
        method: 'get',
        params: { id: 123 },
        data: { filter: 'all' }
      }
      const key = generateRequestKey(config)
      expect(key).toBe('GET:/api/songs:{"id":123}:{"filter":"all"}')
    })

    it('should handle missing method (defaults to UNKNOWN)', () => {
      const config: RequestConfig = {
        url: '/api/test',
        params: {},
        data: {}
      }
      const key = generateRequestKey(config)
      expect(key).toBe('UNKNOWN:/api/test:{}:{}')
    })

    it('should uppercase method', () => {
      const config: RequestConfig = {
        url: '/api/test',
        method: 'post',
        params: {},
        data: {}
      }
      const key = generateRequestKey(config)
      expect(key).toMatch(/^POST:/)
    })

    it('should handle missing params and data', () => {
      const config: RequestConfig = {
        url: '/api/test',
        method: 'GET'
      }
      const key = generateRequestKey(config)
      expect(key).toBe('GET:/api/test:{}:{}')
    })

    it('should handle null params and data', () => {
      const config: RequestConfig = {
        url: '/api/test',
        method: 'DELETE',
        params: null,
        data: null
      }
      const key = generateRequestKey(config)
      expect(key).toBe('DELETE:/api/test:{}:{}')
    })

    it('should handle complex nested params', () => {
      const config: RequestConfig = {
        url: '/api/search',
        method: 'get',
        params: { filter: { type: 'song', year: 2024 } },
        data: {}
      }
      const key = generateRequestKey(config)
      expect(key).toContain('"filter":{"type":"song","year":2024}')
    })
  })

  describe('generateCacheKey', () => {
    it('should generate simplified cache key without data', () => {
      const config: RequestConfig = {
        url: '/api/songs',
        method: 'get',
        params: { id: 123 },
        data: { should: 'beIgnored' }
      }
      const key = generateCacheKey(config)
      expect(key).toBe('GET:/api/songs:{"id":123}')
    })

    it('should default method to GET', () => {
      const config: RequestConfig = {
        url: '/api/test'
      }
      const key = generateCacheKey(config)
      expect(key).toBe('GET:/api/test:{}')
    })

    it('should handle missing params', () => {
      const config: RequestConfig = {
        url: '/api/test',
        method: 'post'
      }
      const key = generateCacheKey(config)
      expect(key).toBe('POST:/api/test:{}')
    })
  })

  describe('parseRequestKey', () => {
    it('should parse valid request key', () => {
      const key = 'GET:/api/songs:{"id":123}:{"filter":"all"}'
      const parsed = parseRequestKey(key)
      expect(parsed).toEqual({
        method: 'GET',
        url: '/api/songs',
        params: { id: 123 },
        data: { filter: 'all' }
      })
    })

    it('should handle key with empty params and data', () => {
      const key = 'POST:/api/test:{}:{}'
      const parsed = parseRequestKey(key)
      expect(parsed).toEqual({
        method: 'POST',
        url: '/api/test',
        params: {},
        data: {}
      })
    })

    it('should handle malformed key with less than 2 parts', () => {
      const key = 'invalidKey'
      const parsed = parseRequestKey(key)
      expect(parsed).toEqual({
        method: 'UNKNOWN',
        url: 'invalidKey',
        params: {},
        data: {}
      })
    })

    it('should handle invalid JSON in params', () => {
      const key = 'GET:/api/test:invalidJson:{}'
      const parsed = parseRequestKey(key)
      expect(parsed).toEqual({
        method: 'GET',
        url: '/api/test',
        params: {},
        data: {}
      })
    })

    it('should handle missing data part', () => {
      const key = 'GET:/api/test:{"id":1}'
      const parsed = parseRequestKey(key)
      expect(parsed.params).toEqual({ id: 1 })
      expect(parsed.data).toEqual({})
    })
  })

  describe('isSameRequest', () => {
    it('should return true for identical configs', () => {
      const config1: RequestConfig = {
        url: '/api/test',
        method: 'get',
        params: { id: 1 },
        data: {}
      }
      const config2: RequestConfig = {
        url: '/api/test',
        method: 'get',
        params: { id: 1 },
        data: {}
      }
      expect(isSameRequest(config1, config2)).toBe(true)
    })

    it('should return false for different urls', () => {
      const config1: RequestConfig = { url: '/api/test1', method: 'get', params: {}, data: {} }
      const config2: RequestConfig = { url: '/api/test2', method: 'get', params: {}, data: {} }
      expect(isSameRequest(config1, config2)).toBe(false)
    })

    it('should return false for different methods', () => {
      const config1: RequestConfig = { url: '/api/test', method: 'get', params: {}, data: {} }
      const config2: RequestConfig = { url: '/api/test', method: 'post', params: {}, data: {} }
      expect(isSameRequest(config1, config2)).toBe(false)
    })

    it('should return false for different params', () => {
      const config1: RequestConfig = {
        url: '/api/test',
        method: 'get',
        params: { id: 1 },
        data: {}
      }
      const config2: RequestConfig = {
        url: '/api/test',
        method: 'get',
        params: { id: 2 },
        data: {}
      }
      expect(isSameRequest(config1, config2)).toBe(false)
    })

    it('should be case-insensitive for method', () => {
      const config1: RequestConfig = { url: '/api/test', method: 'GET', params: {}, data: {} }
      const config2: RequestConfig = { url: '/api/test', method: 'get', params: {}, data: {} }
      expect(isSameRequest(config1, config2)).toBe(true)
    })
  })

  describe('generateRequestKeys', () => {
    it('should generate keys for multiple configs', () => {
      const configs: RequestConfig[] = [
        { url: '/api/test1', method: 'get', params: {}, data: {} },
        { url: '/api/test2', method: 'post', params: { id: 1 }, data: {} }
      ]
      const keys = generateRequestKeys(configs)
      expect(keys).toHaveLength(2)
      expect(keys[0]).toBe('GET:/api/test1:{}:{}')
      expect(keys[1]).toBe('POST:/api/test2:{"id":1}:{}')
    })

    it('should return empty array for empty input', () => {
      const keys = generateRequestKeys([])
      expect(keys).toEqual([])
    })
  })
})
