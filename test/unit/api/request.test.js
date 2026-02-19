import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  }
}))

describe('API Request Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module cache to test different environments
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Environment Detection', () => {
    it('should detect Electron environment', async () => {
      // Mock Electron user agent
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Electron/28.0.0',
        configurable: true
      })

      const { default: request } = await import('../../../src/api/request.js')
      
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:14532',
          withCredentials: true
        })
      )
    })

    it('should detect Web environment', async () => {
      // Mock regular browser user agent
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        configurable: true
      })

      const { default: request } = await import('../../../src/api/request.js')
      
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: '/api',
          withCredentials: false
        })
      )
    })
  })

  describe('Request Configuration', () => {
    it('should have correct timeout', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const { default: request } = await import('../../../src/api/request.js')

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000
        })
      )
    })

    it('should have timeout of exactly 30000ms to prevent regression', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const { default: request } = await import('../../../src/api/request.js')

      // Assert axios.create was called exactly once
      expect(axios.create).toHaveBeenCalledTimes(1)

      // Get the config passed to axios.create
      const createCall = axios.create.mock.calls[0][0]

      // Strict assertion: timeout must be exactly 30000
      expect(createCall.timeout).toBe(30000)

      // Also verify it's not a lower value that might have been accidentally set
      expect(createCall.timeout).toBeGreaterThanOrEqual(30000)

      // Verify the config object contains expected properties
      expect(createCall).toMatchObject({
        baseURL: expect.any(String),
        timeout: 30000,
        withCredentials: expect.any(Boolean)
      })
    })

    it('should not allow timeout below 30000ms', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const { default: request } = await import('../../../src/api/request.js')

      const createCall = axios.create.mock.calls[0][0]

      // Ensure timeout is not set to lower values that could cause issues
      expect(createCall.timeout).not.toBe(15000)
      expect(createCall.timeout).not.toBe(10000)
      expect(createCall.timeout).not.toBe(5000)
      expect(createCall.timeout).toBe(30000)
    })
  })

  describe('Request Interceptor', () => {
    it('should handle request errors', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await import('../../../src/api/request.js')
      
      // Get the error handler from the interceptor
      const mockInstance = axios.create.mock.results[0].value
      const errorHandler = mockInstance.interceptors.request.use.mock.calls[0][1]
      
      const mockError = new Error('Network Error')
      await expect(errorHandler(mockError)).rejects.toThrow('Network Error')
      expect(consoleSpy).toHaveBeenCalledWith('Request error:', mockError)
      
      consoleSpy.mockRestore()
    })
  })

  describe('Response Interceptor', () => {
    it('should handle 401 errors', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await import('../../../src/api/request.js')
      
      const mockInstance = axios.create.mock.results[0].value
      const errorHandler = mockInstance.interceptors.response.use.mock.calls[0][1]
      
      const mockError = {
        response: { status: 401, data: { message: 'Unauthorized' } }
      }
      
      await expect(errorHandler(mockError)).rejects.toEqual(mockError)
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should handle 500 errors', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await import('../../../src/api/request.js')
      
      const mockInstance = axios.create.mock.results[0].value
      const errorHandler = mockInstance.interceptors.response.use.mock.calls[0][1]
      
      const mockError = {
        response: { status: 500, data: { message: 'Server Error' } }
      }
      
      await expect(errorHandler(mockError)).rejects.toEqual(mockError)
      
      consoleSpy.mockRestore()
    })

    it('should handle network errors', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        configurable: true
      })

      await import('../../../src/api/request.js')
      
      const mockInstance = axios.create.mock.results[0].value
      const errorHandler = mockInstance.interceptors.response.use.mock.calls[0][1]
      
      const mockError = new Error('Network Error')
      
      await expect(errorHandler(mockError)).rejects.toThrow('Network Error')
    })
  })
})