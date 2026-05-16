import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  performanceMonitor,
  getPerformanceMetrics,
  getSlowRequests,
  getPerformanceReport,
  resetPerformanceMetrics
} from '../../electron/ipc/middleware/performance'
import type { PerformanceMetrics } from '../../electron/ipc/middleware/performance'

describe('IPC Performance Monitor', () => {
  beforeEach(() => {
    resetPerformanceMetrics()
  })

  afterEach(() => {
    resetPerformanceMetrics()
  })

  describe('recordCompletion', () => {
    it('should track basic metrics', () => {
      performanceMonitor.recordCompletion('test:channel', 100, true)

      const metrics = getPerformanceMetrics('test:channel')
      expect(metrics).toBeDefined()
      expect(metrics?.totalRequests).toBe(1)
      expect(metrics?.successfulRequests).toBe(1)
      expect(metrics?.failedRequests).toBe(0)
      expect(metrics?.avgDuration).toBe(100)
      expect(metrics?.minDuration).toBe(100)
      expect(metrics?.maxDuration).toBe(100)
    })

    it('should calculate average duration correctly', () => {
      performanceMonitor.recordCompletion('test:channel', 100, true)
      performanceMonitor.recordCompletion('test:channel', 200, true)
      performanceMonitor.recordCompletion('test:channel', 300, true)

      const metrics = getPerformanceMetrics('test:channel')
      expect(metrics?.totalRequests).toBe(3)
      expect(metrics?.avgDuration).toBe(200)
      expect(metrics?.minDuration).toBe(100)
      expect(metrics?.maxDuration).toBe(300)
    })

    it('should track failed requests', () => {
      performanceMonitor.recordCompletion('test:channel', 100, false, 'Test error')

      const metrics = getPerformanceMetrics('test:channel')
      expect(metrics?.failedRequests).toBe(1)
    })

    it('should detect slow requests (>= 1000ms)', () => {
      performanceMonitor.recordCompletion('slow:channel', 1500, true)

      const metrics = getPerformanceMetrics('slow:channel')
      expect(metrics?.slowRequests).toBe(1)
    })

    it('should not mark fast requests as slow', () => {
      performanceMonitor.recordCompletion('fast:channel', 500, true)

      const metrics = getPerformanceMetrics('fast:channel')
      expect(metrics?.slowRequests).toBe(0)
    })
  })

  describe('getSlowRequests', () => {
    it('should return empty array when no slow requests', () => {
      performanceMonitor.recordCompletion('fast:channel', 100, true)

      const slowRequests = getSlowRequests()
      expect(slowRequests).toHaveLength(0)
    })

    it('should return slow requests with details', () => {
      performanceMonitor.recordCompletion('slow:channel', 2000, true)

      const slowRequests = getSlowRequests()
      expect(slowRequests).toHaveLength(1)
      expect(slowRequests[0].channel).toBe('slow:channel')
      expect(slowRequests[0].duration).toBe(2000)
      expect(slowRequests[0].requestId).toBeDefined()
    })

    it('should limit the number of returned slow requests', () => {
      // Record 10 slow requests
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordCompletion(`slow:channel:${i}`, 2000, true)
      }

      const slowRequests = getSlowRequests(5)
      expect(slowRequests.length).toBeLessThanOrEqual(5)
    })
  })

  describe('getPerformanceReport', () => {
    it('should return empty report when no metrics', () => {
      const report = getPerformanceReport()

      expect(report.summary.totalChannels).toBe(0)
      expect(report.summary.totalRequests).toBe(0)
      expect(report.slowestChannels).toHaveLength(0)
    })

    it('should return report with metrics', () => {
      // Record some requests
      for (let i = 0; i < 15; i++) {
        performanceMonitor.recordCompletion('test:channel', 100 + i * 10, true)
      }

      const report = getPerformanceReport()

      expect(report.summary.totalChannels).toBe(1)
      expect(report.summary.totalRequests).toBe(15)
      expect(report.slowestChannels).toHaveLength(1)
      expect(report.slowestChannels[0].channel).toBe('test:channel')
    })

    it('should sort channels by average duration', () => {
      // Record requests for multiple channels
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordCompletion('fast:channel', 50, true)
        performanceMonitor.recordCompletion('slow:channel', 500, true)
        performanceMonitor.recordCompletion('medium:channel', 200, true)
      }

      const report = getPerformanceReport()

      expect(report.slowestChannels[0].channel).toBe('slow:channel')
      expect(report.slowestChannels[1].channel).toBe('medium:channel')
      expect(report.slowestChannels[2].channel).toBe('fast:channel')
    })

    it('should only include channels with at least 10 requests', () => {
      // Record 9 requests for one channel
      for (let i = 0; i < 9; i++) {
        performanceMonitor.recordCompletion('few:channel', 1000, true)
      }

      // Record 10 requests for another channel
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordCompletion('enough:channel', 100, true)
      }

      const report = getPerformanceReport()

      // Channel with only 9 requests should not be in slowestChannels
      const channelNames = report.slowestChannels.map(c => c.channel)
      expect(channelNames).not.toContain('few:channel')
      expect(channelNames).toContain('enough:channel')
    })
  })

  describe('reset', () => {
    it('should reset metrics for a specific channel', () => {
      performanceMonitor.recordCompletion('channel:a', 100, true)
      performanceMonitor.recordCompletion('channel:b', 200, true)

      resetPerformanceMetrics('channel:a')

      const metricsA = getPerformanceMetrics('channel:a')
      const metricsB = getPerformanceMetrics('channel:b')

      expect(metricsA).toBeUndefined()
      expect(metricsB).toBeDefined()
      expect(metricsB?.totalRequests).toBe(1)
    })

    it('should reset all metrics', () => {
      performanceMonitor.recordCompletion('channel:a', 100, true)
      performanceMonitor.recordCompletion('channel:b', 200, true)

      resetPerformanceMetrics()

      const allMetrics = getPerformanceMetrics() as Map<string, PerformanceMetrics>
      expect(allMetrics.size).toBe(0)
    })
  })
})
