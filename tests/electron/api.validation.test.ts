import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import {
  validateService,
  validateEndpoint,
  validateParams,
  normalizeEndpoint,
  resolvePlatform
} from '../../electron/ipc/handlers/api.validation'

vi.mock('../../electron/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('api.validation', () => {
  describe('resolvePlatform', () => {
    it('should return "qq" when platform is "qq"', () => {
      expect(resolvePlatform('qq')).toBe('qq')
    })

    it('should return "netease" when platform is "netease"', () => {
      expect(resolvePlatform('netease')).toBe('netease')
    })

    it('should return "netease" as default for undefined', () => {
      expect(resolvePlatform(undefined)).toBe('netease')
    })

    it('should return "netease" for any other value', () => {
      expect(resolvePlatform('other')).toBe('netease')
      expect(resolvePlatform('')).toBe('netease')
    })
  })

  describe('normalizeEndpoint', () => {
    it('should remove leading slashes', () => {
      expect(normalizeEndpoint('/api/search')).toBe('api/search')
      expect(normalizeEndpoint('///api/search')).toBe('api/search')
    })

    it('should decode URI encoded endpoints', () => {
      expect(normalizeEndpoint('api%2Fsearch')).toBe('api/search')
    })

    it('should handle normal endpoints', () => {
      expect(normalizeEndpoint('search')).toBe('search')
      expect(normalizeEndpoint('api/search')).toBe('api/search')
    })

    it('should return empty string for dangerous patterns', () => {
      expect(normalizeEndpoint('../etc/passwd')).toBe('')
      expect(normalizeEndpoint('api/<script>')).toBe('')
      expect(normalizeEndpoint('api/test|cmd')).toBe('')
    })

    it('should handle null bytes and control characters', () => {
      expect(normalizeEndpoint('api\u0000test')).toBe('')
    })
  })

  describe('validateService', () => {
    it('should validate "netease" service', () => {
      const result = validateService('netease')
      expect(result.valid).toBe(true)
    })

    it('should validate "qq" service', () => {
      const result = validateService('qq')
      expect(result.valid).toBe(true)
    })

    it('should reject invalid services', () => {
      const result = validateService('spotify')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid service')
    })

    it('should reject non-string services', () => {
      const result = validateService(123)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be a string')
    })

    it('should reject undefined service', () => {
      const result = validateService(undefined)
      expect(result.valid).toBe(false)
    })
  })

  describe('validateEndpoint', () => {
    it('should validate normal endpoints', () => {
      const result = validateEndpoint('search')
      expect(result.valid).toBe(true)
      expect(result.normalized).toBe('search')
    })

    it('should normalize endpoints with leading slashes', () => {
      const result = validateEndpoint('/api/search')
      expect(result.valid).toBe(true)
      expect(result.normalized).toBe('api/search')
    })

    it('should reject empty endpoints', () => {
      const result = validateEndpoint('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should reject non-string endpoints', () => {
      const result = validateEndpoint(123)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be a string')
    })

    it('should reject dangerous endpoints', () => {
      const result = validateEndpoint('../etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('dangerous')
    })

    it('should reject too long endpoints', () => {
      const longEndpoint = 'a'.repeat(201)
      const result = validateEndpoint(longEndpoint)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too long')
    })
  })

  describe('validateParams', () => {
    it('should validate with no required params', () => {
      const result = validateParams({})
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate with valid required params', () => {
      const result = validateParams({ keyword: 'test' }, ['keyword'])
      expect(result.valid).toBe(true)
    })

    it('should reject missing required params', () => {
      const result = validateParams({}, ['keyword'])
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required parameter: keyword')
    })

    it('should validate keyword param', () => {
      // Valid
      expect(validateParams({ keyword: 'test' }).valid).toBe(true)
      expect(validateParams({ keyword: 'a'.repeat(100) }).valid).toBe(true)

      // Invalid - too long
      expect(validateParams({ keyword: 'a'.repeat(101) }).valid).toBe(false)
    })

    it('should validate id param', () => {
      expect(validateParams({ id: '123' }).valid).toBe(true)
      expect(validateParams({ id: 123 }).valid).toBe(true)
      expect(validateParams({ id: true }).valid).toBe(false)
    })

    it('should validate page param', () => {
      expect(validateParams({ page: 1 }).valid).toBe(true)
      expect(validateParams({ page: 100 }).valid).toBe(true)
      expect(validateParams({ page: 0 }).valid).toBe(false)
      expect(validateParams({ page: 101 }).valid).toBe(false)
    })

    it('should validate limit param', () => {
      expect(validateParams({ limit: 1 }).valid).toBe(true)
      expect(validateParams({ limit: 100 }).valid).toBe(true)
      expect(validateParams({ limit: 0 }).valid).toBe(false)
      expect(validateParams({ limit: 101 }).valid).toBe(false)
    })

    it('should validate platform param', () => {
      expect(validateParams({ platform: 'netease' }).valid).toBe(true)
      expect(validateParams({ platform: 'qq' }).valid).toBe(true)
      expect(validateParams({ platform: 'other' }).valid).toBe(false)
    })

    it('should reject non-object params', () => {
      const result = validateParams('not an object')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Params must be an object')
    })

    it('should accept undefined params', () => {
      const result = validateParams(undefined)
      expect(result.valid).toBe(true)
    })
  })
})
