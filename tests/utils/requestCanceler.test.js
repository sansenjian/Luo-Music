import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  cancelPendingRequest,
  registerRequest,
  removeRequest,
  cancelAllRequests,
  cancelRequestsByUrl,
  getActiveRequestCount,
  getActiveRequestKeys,
  isRequestActive,
  generateRequestKey
} from '../../src/utils/http/requestCanceler'

describe('requestCanceler', () => {
  beforeEach(() => {
    cancelAllRequests()
  })

  const mockConfig = {
    method: 'get',
    url: '/api/test',
    params: { id: 1 }
  }

  describe('generateRequestKey', () => {
    it('应该生成正确的请求键', () => {
      const key = generateRequestKey(mockConfig)
      expect(key).toBe('GET:/api/test:{"id":1}:{}')
    })

    it('相同配置应该生成相同的键', () => {
      const key1 = generateRequestKey(mockConfig)
      const key2 = generateRequestKey(mockConfig)
      expect(key1).toBe(key2)
    })

    it('不同配置应该生成不同的键', () => {
      const config1 = { method: 'get', url: '/api/test', params: { id: 1 } }
      const config2 = { method: 'get', url: '/api/test', params: { id: 2 } }
      
      const key1 = generateRequestKey(config1)
      const key2 = generateRequestKey(config2)
      
      expect(key1).not.toBe(key2)
    })
  })

  describe('registerRequest & removeRequest', () => {
    it('应该能够注册和移除请求', () => {
      const controller = new AbortController()
      registerRequest(mockConfig, controller)
      
      expect(getActiveRequestCount()).toBe(1)
      expect(isRequestActive(mockConfig)).toBe(true)
      
      const key = generateRequestKey(mockConfig)
      removeRequest(key)
      
      expect(getActiveRequestCount()).toBe(0)
      expect(isRequestActive(mockConfig)).toBe(false)
    })
  })

  describe('cancelPendingRequest', () => {
    it('应该取消未完成的请求', () => {
      const controller = new AbortController()
      registerRequest(mockConfig, controller)
      
      const abortSpy = vi.spyOn(controller, 'abort')
      const key = generateRequestKey(mockConfig)
      cancelPendingRequest(key)
      
      expect(abortSpy).toHaveBeenCalled()
      expect(getActiveRequestCount()).toBe(0)
    })

    it('取消不存在的请求不应该报错', () => {
      expect(() => {
        cancelPendingRequest('non-existent-key')
      }).not.toThrow()
    })
  })

  describe('cancelAllRequests', () => {
    it('应该取消所有请求', () => {
      const controllers = []
      
      for (let i = 0; i < 5; i++) {
        const controller = new AbortController()
        controllers.push(controller)
        registerRequest(
          { method: 'get', url: `/api/test${i}`, params: {} },
          controller
        )
      }
      
      expect(getActiveRequestCount()).toBe(5)
      
      cancelAllRequests()
      
      expect(getActiveRequestCount()).toBe(0)
      controllers.forEach(controller => {
        expect(controller.signal.aborted).toBe(true)
      })
    })
  })

  describe('cancelRequestsByUrl', () => {
    it('应该取消指定 URL 的请求', () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const controller3 = new AbortController()
      
      registerRequest({ method: 'get', url: '/api/search', params: { q: 'a' } }, controller1)
      registerRequest({ method: 'get', url: '/api/search', params: { q: 'b' } }, controller2)
      registerRequest({ method: 'get', url: '/api/other', params: {} }, controller3)
      
      expect(getActiveRequestCount()).toBe(3)
      
      cancelRequestsByUrl('/api/search')
      
      expect(getActiveRequestCount()).toBe(1)
      expect(controller1.signal.aborted).toBe(true)
      expect(controller2.signal.aborted).toBe(true)
      expect(controller3.signal.aborted).toBe(false)
    })

    it('应该支持正则表达式匹配', () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      
      registerRequest({ method: 'get', url: '/song/123', params: {} }, controller1)
      registerRequest({ method: 'get', url: '/song/456', params: {} }, controller2)
      registerRequest({ method: 'get', url: '/playlist/123', params: {} }, new AbortController())
      
      cancelRequestsByUrl('/song/.*')
      
      expect(getActiveRequestCount()).toBe(1)
      expect(controller1.signal.aborted).toBe(true)
      expect(controller2.signal.aborted).toBe(true)
    })
  })

  describe('getActiveRequestKeys', () => {
    it('应该返回所有活跃请求的键', () => {
      registerRequest({ method: 'get', url: '/api/test1', params: {} }, new AbortController())
      registerRequest({ method: 'get', url: '/api/test2', params: {} }, new AbortController())
      
      const keys = getActiveRequestKeys()
      
      expect(keys).toHaveLength(2)
      expect(keys).toContain('GET:/api/test1:{}:{}')
      expect(keys).toContain('GET:/api/test2:{}:{}')
    })
  })

  describe('isRequestActive', () => {
    it('应该检查请求是否活跃', () => {
      const controller = new AbortController()
      registerRequest(mockConfig, controller)
      
      expect(isRequestActive(mockConfig)).toBe(true)
      
      cancelAllRequests()
      
      expect(isRequestActive(mockConfig)).toBe(false)
    })
  })

  describe('AbortController 集成', () => {
    it('取消的请求应该触发 abort 事件', async () => {
      const controller = new AbortController()
      const abortHandler = vi.fn()
      
      controller.signal.addEventListener('abort', abortHandler)
      registerRequest(mockConfig, controller)
      
      const key = generateRequestKey(mockConfig)
      cancelPendingRequest(key)
      
      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(abortHandler).toHaveBeenCalled()
    })
  })

  describe('内存泄漏防护', () => {
    it('取消后应该清空调用者引用', () => {
      const controller = new AbortController()
      registerRequest(mockConfig, controller)
      
      const key = generateRequestKey(mockConfig)
      cancelPendingRequest(key)
      
      // 确保 Map 中不再有该请求
      expect(getActiveRequestCount()).toBe(0)
    })
  })
})
