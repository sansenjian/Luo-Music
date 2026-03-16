/**
 * Platform Service Tests
 * 平台服务单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Disposable } from '../../src/base/common/lifecycle/disposable'
import {
  PlatformServiceRegistry,
  formatBytes,
  detectMobile
} from '../../src/platform/common/platformService'
import { WebPlatformService } from '../../src/platform/web/webPlatformService'
import type { IMessageHandler } from '../../src/platform/common/types'

// Mock Electron 模块
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getName: vi.fn(() => 'luo-music'),
    getVersion: vi.fn(() => '1.0.0')
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null)
  },
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn()
  }
}))

describe('PlatformServiceRegistry', () => {
  beforeEach(() => {
    // 清除注册表状态
    PlatformServiceRegistry.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('应该能注册和获取平台服务', () => {
    const service = new WebPlatformService()
    PlatformServiceRegistry.register(service)

    expect(PlatformServiceRegistry.hasInstance()).toBe(true)
    expect(PlatformServiceRegistry.get()).toBe(service)
  })

  it('重复注册会覆盖之前的服务', () => {
    const service1 = new WebPlatformService()
    const service2 = new WebPlatformService()

    PlatformServiceRegistry.register(service1)
    PlatformServiceRegistry.register(service2)

    expect(PlatformServiceRegistry.get()).toBe(service2)
  })

  it('未注册时获取应该抛出错误', () => {
    expect(() => {
      PlatformServiceRegistry.get()
    }).toThrow('No platform service registered')
  })

  it('应该能清除服务', () => {
    const service = new WebPlatformService()
    PlatformServiceRegistry.register(service)

    PlatformServiceRegistry.clear()

    expect(PlatformServiceRegistry.hasInstance()).toBe(false)
  })
})

describe('WebPlatformService', () => {
  let service: WebPlatformService

  beforeEach(() => {
    service = new WebPlatformService()
    // 清理 localStorage
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    service.dispose()
  })

  describe('平台信息', () => {
    it('name 应该返回 web', () => {
      expect(service.name).toBe('web')
    })

    it('isElectron 应该返回 false', () => {
      expect(service.isElectron()).toBe(false)
    })

    it('isMobile 应该检测移动设备', () => {
      // 默认非移动设备
      expect(service.isMobile()).toBe(false)
    })
  })

  describe('IPC 模拟', () => {
    it('应该能发送和接收消息', async () => {
      const handler = vi.fn<IMessageHandler>()
      service.on('test-channel', handler)

      service.send('test-channel', { data: 'test' })

      // 等待事件循环完成
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(handler).toHaveBeenCalledWith({ data: 'test' })
    })

    it('应该返回可释放的 Disposable', () => {
      const handler = vi.fn<IMessageHandler>()
      const disposable = service.on('test-channel', handler)

      // 验证返回的是有效的 Disposable
      expect(disposable).toBeDefined()
      expect(typeof disposable.dispose).toBe('function')

      // 可以正常调用 dispose
      expect(() => disposable.dispose()).not.toThrow()
    })
  })

  describe('缓存管理', () => {
    it('应该能获取缓存大小', async () => {
      // 添加一些 localStorage 数据
      localStorage.setItem('test-key', 'test-value-'.repeat(100))

      const cacheSize = await service.getCacheSize()

      expect(cacheSize).toHaveProperty('httpCache')
      expect(cacheSize).toHaveProperty('httpCacheFormatted')
      expect(typeof cacheSize.httpCache).toBe('number')
      expect(cacheSize.httpCache).toBeGreaterThan(0)
    })

    it('应该能清除缓存', async () => {
      localStorage.setItem('test-key', 'test-value')
      sessionStorage.setItem('test-session', 'session-value')

      const result = await service.clearCache({
        cache: true,
        localStorage: true,
        sessionStorage: true
      })

      expect(result.failed).toEqual([])
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
    })

    it('clearAllCache 应该清除所有缓存', async () => {
      localStorage.setItem('test-key', 'test-value')

      const result = await service.clearAllCache()

      expect(result.failed).toEqual([])
      expect(localStorage.length).toBe(0)
    })

    it('keepUserData 应该保留用户数据', async () => {
      localStorage.setItem('test-key', 'test-value')

      const result = await service.clearAllCache(true)

      expect(result.failed).toEqual([])
      expect(localStorage.getItem('test-key')).toBe('test-value')
    })
  })
})

describe('工具函数', () => {
  describe('formatBytes', () => {
    it('应该正确格式化字节', () => {
      expect(formatBytes(0)).toBe('0 B')
      // formatBytes 使用 parseFloat().toFixed() 会去掉尾随零
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024)).toBe('1 MB')
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('应该处理小数值', () => {
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(2560)).toBe('2.5 KB')
    })

    it('应该支持自定义小数位数', () => {
      expect(formatBytes(1024, 0)).toBe('1 KB')
      expect(formatBytes(1536, 0)).toBe('2 KB')
      expect(formatBytes(1536, 1)).toBe('1.5 KB')
      expect(formatBytes(1536, 2)).toBe('1.5 KB')
      expect(formatBytes(1537, 2)).toBe('1.5 KB')
    })
  })

  describe('detectMobile', () => {
    it('在默认环境下应该返回 false', () => {
      // 在 Node.js 环境下没有 userAgent
      expect(detectMobile()).toBe(false)
    })
  })
})

describe('Disposable 集成', () => {
  it('平台服务应该实现 IDisposable', () => {
    const service = new WebPlatformService()

    expect(typeof service.dispose).toBe('function')

    // 应该能正常调用 dispose
    expect(() => service.dispose()).not.toThrow()
  })
})
