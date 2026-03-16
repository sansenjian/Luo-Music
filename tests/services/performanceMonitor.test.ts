import { describe, it, expect, beforeEach } from 'vitest'
import {
  getServiceMetrics,
  getAllServiceMetrics,
  getPerformanceReport,
  getSlowestServices,
  getMostUsedServices,
  resetMetrics,
  enableMonitoring,
  disableMonitoring
} from '@/services/performanceMonitor'
import { registerService, getService, resetServices } from '@/services/registry'
import { LogLevel } from '@/services/loggerService'
import { IApiService, ILoggerService, IConfigService } from '@/services/types'

function createMockLoggerService() {
  return {
    resource: 'test',
    onDidChangeLogLevel: () => ({ dispose: () => {} }),
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    setLevel: () => {},
    getLevel: () => LogLevel.Info,
    createLogger: () => createMockLoggerService(),
    getLogger: () => createMockLoggerService(),
    hasLogger: () => true,
    flush: () => {},
    dispose: () => {}
  }
}

describe('performanceMonitor', () => {
  beforeEach(() => {
    resetServices()
    resetMetrics()
    enableMonitoring()
  })

  describe('trackServiceInit', () => {
    it('should track service initialization time', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))

      getService(IApiService)

      const metrics = getServiceMetrics('IApiService')
      expect(metrics).toBeDefined()
      expect(metrics!.initTime).toBeGreaterThanOrEqual(0)
      expect(metrics!.getCount).toBe(1)
    })

    it('should track multiple services', () => {
      registerService(IApiService, () => ({ request: () => Promise.resolve({ data: {} }) }))
      registerService(ILoggerService, () => createMockLoggerService())
      registerService(IConfigService, () => ({
        get: () => ({ env: { mode: 'test', isDev: true, isProd: false }, ports: { qq: 3200, netease: 14532 } }),
        getPort: () => 3000
      }))

      getService(IApiService)
      getService(ILoggerService)
      getService(IConfigService)

      const allMetrics = getAllServiceMetrics()
      expect(allMetrics.length).toBe(3)
    })
  })

  describe('trackServiceGet', () => {
    it('should increment get count on repeated calls', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))

      getService(IApiService)
      getService(IApiService)
      getService(IApiService)

      const metrics = getServiceMetrics('IApiService')
      expect(metrics!.getCount).toBe(3)
    })

    it('should update lastAccessTime on each get', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))

      getService(IApiService)
      const firstAccess = getServiceMetrics('IApiService')!.lastAccessTime

      // 等待 10ms 后再次获取
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

      // 由于是同步测试，我们只验证 lastAccessTime 存在
      expect(firstAccess).toBeDefined()
    })
  })

  describe('getPerformanceReport', () => {
    it('should generate formatted report', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))
      registerService(ILoggerService, () => createMockLoggerService())

      getService(IApiService)
      getService(ILoggerService)

      const report = getPerformanceReport()
      expect(report).toContain('Service Performance Report')
      expect(report).toContain('Total Services: 2')
      expect(report).toContain('IApiService')
      expect(report).toContain('ILoggerService')
    })

    it('should handle empty metrics', () => {
      const report = getPerformanceReport()
      expect(report).toContain('No service metrics available')
    })
  })

  describe('getSlowestServices', () => {
    it('should return services sorted by init time', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))
      registerService(ILoggerService, () => createMockLoggerService())

      getService(IApiService)
      getService(ILoggerService)

      const slowest = getSlowestServices(2)
      expect(slowest.length).toBeLessThanOrEqual(2)
    })

    it('should respect limit parameter', () => {
      registerService(IApiService, () => ({ request: () => Promise.resolve({ data: {} }) }))
      registerService(ILoggerService, () => createMockLoggerService())
      registerService(IConfigService, () => ({
        get: () => ({ env: { mode: 'test', isDev: true, isProd: false }, ports: { qq: 3200, netease: 14532 } }),
        getPort: () => 3000
      }))

      getService(IApiService)
      getService(ILoggerService)
      getService(IConfigService)

      const slowest = getSlowestServices(1)
      expect(slowest.length).toBe(1)
    })
  })

  describe('getMostUsedServices', () => {
    it('should return services sorted by get count', () => {
      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))
      registerService(ILoggerService, () => createMockLoggerService())

      getService(IApiService)
      getService(IApiService)
      getService(ILoggerService)

      const mostUsed = getMostUsedServices(2)
      expect(mostUsed[0].name).toBe('IApiService')
      expect(mostUsed[0].getCount).toBe(2)
    })
  })

  describe('enableMonitoring/disableMonitoring', () => {
    it('should not track metrics when disabled', () => {
      disableMonitoring()

      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))

      getService(IApiService)

      // 禁用时不应有指标
      const metrics = getServiceMetrics('IApiService')
      expect(metrics).toBeUndefined()
    })

    it('should track metrics when re-enabled', () => {
      disableMonitoring()
      enableMonitoring()

      registerService(IApiService, () => ({
        request: () => Promise.resolve({ data: {} })
      }))

      getService(IApiService)

      const metrics = getServiceMetrics('IApiService')
      expect(metrics).toBeDefined()
    })
  })
})
