import { describe, it, expect, vi } from 'vitest'
import {
  shouldRetry,
  calculateRetryDelay,
  getRetryConfig,
  updateRetryConfig,
  getRetryStats,
  resetRetryStats,
  recordRetryStat
} from '../../src/utils/requestRetry'

describe('requestRetry', () => {
  const mockConfig = {
    method: 'get',
    url: '/api/test',
    params: {}
  }

  describe('shouldRetry', () => {
    it('网络错误应该重试', () => {
      const error = {
        message: 'Network Error',
        code: 'ENOTFOUND'
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('超时错误应该重试', () => {
      const error = {
        message: 'timeout',
        code: 'ECONNABORTED'
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('5xx 服务器错误应该重试', () => {
      const error = {
        message: 'Internal Server Error',
        response: { status: 500 }
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('502/503/504 错误应该重试', () => {
      [502, 503, 504].forEach(status => {
        const error = {
          message: 'Bad Gateway',
          response: { status }
        }
        expect(shouldRetry(error, 0, mockConfig)).toBe(true)
      })
    })

    it('4xx 客户端错误不应该重试', () => {
      [400, 401, 403, 404, 422].forEach(status => {
        const error = {
          message: 'Client Error',
          response: { status }
        }
        expect(shouldRetry(error, 0, mockConfig)).toBe(false)
      })
    })

    it('超过最大重试次数不应该重试', () => {
      const error = {
        message: 'Network Error',
        code: 'ENOTFOUND'
      }
      
      expect(shouldRetry(error, 3, { ...mockConfig, retry: 3 })).toBe(false)
    })

    it('禁用重试时不应该重试', () => {
      const error = {
        message: 'Network Error',
        code: 'ENOTFOUND'
      }
      
      expect(shouldRetry(error, 0, { ...mockConfig, retry: false })).toBe(false)
    })

    it('请求被取消时不应该重试', () => {
      const error = {
        name: 'AbortError',
        message: 'Aborted'
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(false)
    })

    it('取消错误不应该重试', () => {
      const error = {
        name: 'CanceledError',
        message: 'Canceled'
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(false)
    })
  })

  describe('calculateRetryDelay', () => {
    it('应该使用指数退避计算延迟', () => {
      const delay1 = calculateRetryDelay(1, mockConfig)
      const delay2 = calculateRetryDelay(2, mockConfig)
      const delay3 = calculateRetryDelay(3, mockConfig)
      
      expect(delay2).toBeGreaterThan(delay1)
      expect(delay3).toBeGreaterThan(delay2)
    })

    it('应该添加随机抖动', () => {
      const delays = new Set()
      
      for (let i = 0; i < 10; i++) {
        delays.add(calculateRetryDelay(1, mockConfig))
      }
      
      // 由于有随机抖动，10 次计算应该有不同的延迟
      expect(delays.size).toBeGreaterThan(1)
    })

    it('不应该超过最大延迟', () => {
      const delay = calculateRetryDelay(10, mockConfig)
      expect(delay).toBeLessThanOrEqual(10000)
    })

    it('应该使用自定义配置', () => {
      const customConfig = {
        ...mockConfig,
        retryDelay: 2000,
        retryMaxDelay: 20000,
        retryBackoff: 3
      }
      
      const delay = calculateRetryDelay(2, customConfig)
      expect(delay).toBeGreaterThan(4000) // 2000 * 3^1 = 6000+
    })
  })

  describe('getRetryConfig', () => {
    it('应该返回默认配置', () => {
      const config = getRetryConfig()
      
      expect(config).toEqual({
        MAX_RETRIES: 3,
        INITIAL_DELAY: 1000,
        MAX_DELAY: 10000,
        BACKOFF_MULTIPLIER: 2,
        SHOULD_RETRY_STATUSES: [null, 500, 502, 503, 504]
      })
    })
  })

  describe('updateRetryConfig', () => {
    it('应该更新配置', () => {
      const newConfig = {
        MAX_RETRIES: 5,
        INITIAL_DELAY: 2000
      }
      
      updateRetryConfig(newConfig)
      
      const config = getRetryConfig()
      expect(config.MAX_RETRIES).toBe(5)
      expect(config.INITIAL_DELAY).toBe(2000)
      
      // 恢复默认配置
      updateRetryConfig({
        MAX_RETRIES: 3,
        INITIAL_DELAY: 1000
      })
    })
  })

  describe('retry stats', () => {
    beforeEach(() => {
      resetRetryStats()
    })

    it('应该记录重试统计', () => {
      recordRetryStat(true)
      recordRetryStat(true)
      recordRetryStat(false)
      
      const stats = getRetryStats()
      
      expect(stats.totalRetries).toBe(3)
      expect(stats.successfulRetries).toBe(2)
      expect(stats.failedRetries).toBe(1)
    })

    it('应该能够重置统计', () => {
      recordRetryStat(true)
      resetRetryStats()
      
      const stats = getRetryStats()
      expect(stats.totalRetries).toBe(0)
      expect(stats.successfulRetries).toBe(0)
      expect(stats.failedRetries).toBe(0)
    })
  })

  describe('边界条件', () => {
    it('重试次数为 0 时应该正确处理', () => {
      const error = {
        message: 'Network Error',
        code: 'ENOTFOUND'
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('负数重试次数应该正确处理', () => {
      const error = {
        message: 'Network Error',
        code: 'ENOTFOUND'
      }
      
      expect(shouldRetry(error, -1, mockConfig)).toBe(true)
    })

    it('null 错误对象应该正确处理', () => {
      expect(shouldRetry(null, 0, mockConfig)).toBe(false)
    })

    it('undefined 错误对象应该正确处理', () => {
      expect(shouldRetry(undefined, 0, mockConfig)).toBe(false)
    })
  })

  describe('HTTP 状态码边界测试', () => {
    it('null 状态码应该重试 (网络错误)', () => {
      const error = {
        message: 'Network Error',
        response: null
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('undefined 状态码应该重试', () => {
      const error = {
        message: 'Network Error',
        response: { status: undefined }
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(true)
    })

    it('3xx 重定向不应该重试', () => {
      const error = {
        message: 'Redirect',
        response: { status: 301 }
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(false)
    })

    it('2xx 成功不应该重试', () => {
      const error = {
        message: 'Success',
        response: { status: 200 }
      }
      
      expect(shouldRetry(error, 0, mockConfig)).toBe(false)
    })
  })
})
