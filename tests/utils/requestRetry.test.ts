import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldRetry,
  calculateRetryDelay,
  getRetryStats,
  resetRetryCount
} from '@/utils/http/requestRetry'
import { getRetryConfig } from '@/utils/http/requestConfig'
import type { AxiosError } from 'axios'

/** 创建模拟的 AxiosError */
function createMockAxiosError(
  message: string,
  options: {
    code?: string
    response?: { status: number } | null
  } = {}
): AxiosError {
  const error = new Error(message) as AxiosError
  if (options.code) {
    error.code = options.code
  }
  if (options.response !== undefined) {
    error.response = options.response as AxiosError['response']
  }
  return error
}

describe('requestRetry', () => {
  describe('shouldRetry', () => {
    it('网络错误应该重试', () => {
      const error = createMockAxiosError('Network Error', { code: 'ENOTFOUND' })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(true)
    })

    it('超时错误应该重试', () => {
      const error = createMockAxiosError('timeout', { code: 'ECONNABORTED' })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(true)
    })

    it('5xx 服务器错误应该重试', () => {
      const error = createMockAxiosError('Internal Server Error', {
        response: { status: 500 }
      })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(true)
    })

    it('502/503/504 错误应该重试', () => {
      const config = getRetryConfig()
      ;[502, 503, 504].forEach(status => {
        const error = createMockAxiosError('Bad Gateway', {
          response: { status }
        })
        expect(shouldRetry(error, config)).toBe(true)
      })
    })

    it('4xx 客户端错误不应该重试', () => {
      const config = getRetryConfig()
      ;[400, 401, 403, 404, 422].forEach(status => {
        const error = createMockAxiosError('Client Error', {
          response: { status }
        })
        expect(shouldRetry(error, config)).toBe(false)
      })
    })

    it('禁用重试时不应该重试', () => {
      const error = createMockAxiosError('Network Error', { code: 'ENOTFOUND' })
      const disabledConfig = { ...getRetryConfig(), enabled: false }
      expect(shouldRetry(error, disabledConfig)).toBe(false)
    })

    it('null 错误对象应该抛出错误（不安全调用）', () => {
      const config = getRetryConfig()
      // 注意：shouldRetry 不处理 null/undefined 输入，这是预期行为
      // 调用方应确保传入有效的 AxiosError
      expect(() => shouldRetry(null as unknown as AxiosError, config)).toThrow()
    })

    it('undefined 错误对象应该抛出错误（不安全调用）', () => {
      const config = getRetryConfig()
      // 注意：shouldRetry 不处理 null/undefined 输入，这是预期行为
      // 调用方应确保传入有效的 AxiosError
      expect(() => shouldRetry(undefined as unknown as AxiosError, config)).toThrow()
    })
  })

  describe('calculateRetryDelay', () => {
    it('应该使用指数退避计算延迟', () => {
      const delay1 = calculateRetryDelay(1, 1000, 10000, 2, false)
      const delay2 = calculateRetryDelay(2, 1000, 10000, 2, false)
      const delay3 = calculateRetryDelay(3, 1000, 10000, 2, false)

      expect(delay2).toBeGreaterThan(delay1)
      expect(delay3).toBeGreaterThan(delay2)
    })

    it('应该添加随机抖动', () => {
      const delays = new Set<number>()

      for (let i = 0; i < 10; i++) {
        delays.add(calculateRetryDelay(1, 1000, 10000, 2, true))
      }

      // 由于有随机抖动，10 次计算应该有不同的延迟
      expect(delays.size).toBeGreaterThan(1)
    })

    it('不应该超过最大延迟', () => {
      const delay = calculateRetryDelay(10, 1000, 10000, 2, false)
      expect(delay).toBeLessThanOrEqual(10000)
    })

    it('应该使用自定义配置', () => {
      const delay = calculateRetryDelay(2, 2000, 20000, 3, false)
      expect(delay).toBeGreaterThan(4000) // 2000 * 3^1 = 6000+
    })
  })

  describe('getRetryStats', () => {
    beforeEach(() => {
      // 重置计数
    })

    it('应该返回统计信息', () => {
      const retryMap = new Map<string, number>()
      retryMap.set('test1', 3)
      retryMap.set('test2', 5)

      const stats = getRetryStats(retryMap)

      expect(stats.totalRetries).toBe(8)
      expect(stats.maxRetries).toBe(5)
      expect(stats.averageRetries).toBe(4)
    })

    it('空 Map 应该返回零值', () => {
      const retryMap = new Map<string, number>()
      const stats = getRetryStats(retryMap)

      expect(stats.totalRetries).toBe(0)
      expect(stats.maxRetries).toBe(0)
      expect(stats.averageRetries).toBe(0)
    })
  })

  describe('resetRetryCount', () => {
    it('应该重置特定键', () => {
      const retryMap = new Map<string, number>()
      retryMap.set('test1', 3)
      retryMap.set('test2', 5)

      resetRetryCount(retryMap, 'test1')

      expect(retryMap.has('test1')).toBe(false)
      expect(retryMap.get('test2')).toBe(5)
    })

    it('应该重置所有键', () => {
      const retryMap = new Map<string, number>()
      retryMap.set('test1', 3)
      retryMap.set('test2', 5)

      resetRetryCount(retryMap)

      expect(retryMap.size).toBe(0)
    })
  })

  describe('边界条件', () => {
    it('重试次数为 0 时延迟应该正确', () => {
      const delay = calculateRetryDelay(0, 1000, 10000, 2, false)
      expect(delay).toBe(1000)
    })

    it('负数重试次数应该正确处理', () => {
      const delay = calculateRetryDelay(-1, 1000, 10000, 2, false)
      // -1 次方会得到 0.5，所以 1000 * 0.5 = 500
      expect(delay).toBeGreaterThanOrEqual(0)
    })
  })

  describe('HTTP 状态码边界测试', () => {
    it('null 状态码应该重试 (网络错误)', () => {
      const error = createMockAxiosError('Network Error', { response: null })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(true)
    })

    it('3xx 重定向不应该重试', () => {
      const error = createMockAxiosError('Redirect', {
        response: { status: 301 }
      })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(false)
    })

    it('2xx 成功不应该重试', () => {
      const error = createMockAxiosError('Success', {
        response: { status: 200 }
      })
      const config = getRetryConfig()
      expect(shouldRetry(error, config)).toBe(false)
    })
  })
})
