import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestService,
  requestServiceWithCache,
  serializeErrorDetails
} from '../../electron/ipc/handlers/api.gateway'
import type { ServiceManager } from '../../electron/ServiceManager'

vi.mock('../../electron/ipc/utils/gatewayCache.ts', () => ({
  executeWithRetry: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(() => Promise.resolve())
}))

vi.mock('../../electron/ipc/handlers/api.validation', () => ({
  normalizeEndpoint: vi.fn((e: string) => e.replace(/^\/+/, ''))
}))

import { executeWithRetry, getCache, setCache } from '../../electron/ipc/utils/gatewayCache'

describe('api.gateway', () => {
  let mockServiceManager: { handleRequest: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockServiceManager = {
      handleRequest: vi.fn()
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('requestServiceWithCache', () => {
    it('should return cached data when available', async () => {
      const cachedData = { songs: [] }
      vi.mocked(getCache).mockReturnValue(cachedData)

      const result = await requestServiceWithCache(
        mockServiceManager as unknown as ServiceManager,
        'netease',
        'search',
        { keyword: 'test' }
      )

      expect(result.result).toBe(cachedData)
      expect(result.cached).toBe(true)
      expect(mockServiceManager.handleRequest).not.toHaveBeenCalled()
    })

    it('should fetch and cache data when not cached', async () => {
      const freshData = { songs: [{ id: 1 }] }
      vi.mocked(getCache).mockReturnValue(null)
      vi.mocked(executeWithRetry).mockResolvedValue(freshData)

      const result = await requestServiceWithCache(
        mockServiceManager as unknown as ServiceManager,
        'netease',
        'search',
        { keyword: 'test' }
      )

      expect(result.result).toBe(freshData)
      expect(result.cached).toBe(false)
      expect(executeWithRetry).toHaveBeenCalled()
      expect(setCache).toHaveBeenCalledWith('netease', 'search', { keyword: 'test' }, freshData)
    })

    it('should not cache when noCache is true', async () => {
      const freshData = { songs: [] }
      vi.mocked(getCache).mockReturnValue(null)
      vi.mocked(executeWithRetry).mockResolvedValue(freshData)

      await requestServiceWithCache(
        mockServiceManager as unknown as ServiceManager,
        'netease',
        'search',
        { keyword: 'test' },
        true
      )

      expect(getCache).not.toHaveBeenCalled()
      expect(setCache).not.toHaveBeenCalled()
    })

    it('should not check cache when noCache is true', async () => {
      const freshData = { songs: [] }
      vi.mocked(executeWithRetry).mockResolvedValue(freshData)

      await requestServiceWithCache(
        mockServiceManager as unknown as ServiceManager,
        'netease',
        'search',
        { keyword: 'test' },
        true
      )

      expect(getCache).not.toHaveBeenCalled()
    })
  })

  describe('requestService', () => {
    it('should return only the result', async () => {
      const data = { songs: [] }
      vi.mocked(getCache).mockReturnValue(null)
      vi.mocked(executeWithRetry).mockResolvedValue(data)

      const result = await requestService(
        mockServiceManager as unknown as ServiceManager,
        'netease',
        'search',
        { keyword: 'test' }
      )

      expect(result).toBe(data)
    })
  })

  describe('serializeErrorDetails', () => {
    it('should return undefined for null/undefined', () => {
      expect(serializeErrorDetails(null)).toBeUndefined()
      expect(serializeErrorDetails(undefined)).toBeUndefined()
    })

    it('should return undefined for non-objects', () => {
      expect(serializeErrorDetails('error')).toBeUndefined()
      expect(serializeErrorDetails(123)).toBeUndefined()
    })

    it('should extract code', () => {
      const error = { code: 'ERR_TIMEOUT' }
      const result = serializeErrorDetails(error)
      expect(result?.code).toBe('ERR_TIMEOUT')
    })

    it('should extract reason', () => {
      const error = { reason: 'Network error' }
      const result = serializeErrorDetails(error)
      expect(result?.reason).toBe('Network error')
    })

    it('should extract response status', () => {
      const error = { response: { status: 500 } }
      const result = serializeErrorDetails(error)
      expect(result?.status).toBe(500)
    })

    it('should extract response data', () => {
      const error = { response: { data: { message: 'Server error' } } }
      const result = serializeErrorDetails(error)
      expect(result?.responseData).toEqual({ message: 'Server error' })
    })

    it('should combine all fields', () => {
      const error = {
        code: 'ERR_500',
        reason: 'Internal Server Error',
        response: {
          status: 500,
          data: { error: 'Database connection failed' }
        }
      }
      const result = serializeErrorDetails(error)

      expect(result).toEqual({
        code: 'ERR_500',
        reason: 'Internal Server Error',
        status: 500,
        responseData: { error: 'Database connection failed' }
      })
    })

    it('should ignore non-string code/reason', () => {
      const error = { code: 123, reason: 456 }
      const result = serializeErrorDetails(error)
      expect(result?.code).toBeUndefined()
      expect(result?.reason).toBeUndefined()
    })

    it('should return undefined when no fields match', () => {
      const error = { foo: 'bar' }
      expect(serializeErrorDetails(error)).toBeUndefined()
    })
  })
})
