/**
 * IPC 性能监控中间件
 *
 * 功能：
 * - 慢请求检测和告警
 * - 请求耗时统计
 * - 性能指标收集
 */

import type { IpcMiddleware, IpcMiddlewareContext } from '../IpcService'
import logger from '../../logger'

// ========== 配置常量 ==========

/** 慢请求阈值（毫秒） */
const SLOW_REQUEST_THRESHOLD = 1000

/** 极慢请求阈值（毫秒） */
const VERY_SLOW_REQUEST_THRESHOLD = 3000

/** 统计指标保留时间（毫秒） */
const _METRICS_RETENTION_TIME = 5 * 60 * 1000 // 5 分钟

/** 日志采样间隔（毫秒）- 同一通道的重复告警最小间隔 */
const LOG_SAMPLE_INTERVAL = 30 * 1000 // 30 秒

/** 聚合日志输出间隔（毫秒） */
const AGGREGATED_LOG_INTERVAL = 5 * 60 * 1000 // 5 分钟

// ========== 性能指标类型 ==========

export interface PerformanceMetrics {
  /** 通道名称 */
  channel: string
  /** 请求总数 */
  totalRequests: number
  /** 成功请求数 */
  successfulRequests: number
  /** 失败请求数 */
  failedRequests: number
  /** 平均耗时（毫秒） */
  avgDuration: number
  /** 最小耗时（毫秒） */
  minDuration: number
  /** 最大耗时（毫秒） */
  maxDuration: number
  /** 慢请求数量 */
  slowRequests: number
  /** 最近一次请求时间 */
  lastRequestTime: number
}

export interface SlowRequestEvent {
  channel: string
  requestId: string
  duration: number
  timestamp: number
  error?: string
}

// ========== 性能监控器 ==========

class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null

  private metrics = new Map<string, PerformanceMetrics>()
  private slowRequests: SlowRequestEvent[] = []

  /** 日志采样记录 - 通道上次告警时间 */
  private lastLogTime = new Map<string, number>()

  /** 聚合统计 - 每个通道的慢请求计数 */
  private aggregatedStats = new Map<string, { count: number; totalDuration: number }>()

  /** 聚合日志定时器 ID */
  private aggregatedLogTimer: NodeJS.Timeout | null = null

  private constructor() {
    // 启动聚合日志定时器
    this.startAggregatedLogTimer()
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  /**
   * 记录请求完成
   */
  recordCompletion(channel: string, duration: number, success: boolean, error?: string): void {
    const metrics = this.getOrCreateMetrics(channel)

    metrics.totalRequests++
    if (success) {
      metrics.successfulRequests++
    } else {
      metrics.failedRequests++
    }

    // 更新耗时统计
    if (metrics.minDuration === 0 || duration < metrics.minDuration) {
      metrics.minDuration = duration
    }
    if (duration > metrics.maxDuration) {
      metrics.maxDuration = duration
    }

    // 计算新的平均值
    metrics.avgDuration =
      (metrics.avgDuration * (metrics.totalRequests - 1) + duration) / metrics.totalRequests

    metrics.lastRequestTime = Date.now()

    // 检测慢请求
    if (duration >= SLOW_REQUEST_THRESHOLD) {
      metrics.slowRequests++
      this.recordSlowRequest(channel, duration, error)
    }
  }

  /**
   * 获取通道的性能指标
   */
  getMetrics(channel: string): PerformanceMetrics | undefined {
    return this.metrics.get(channel)
  }

  /**
   * 获取所有通道的性能指标
   */
  getAllMetrics(): Map<string, PerformanceMetrics> {
    return new Map(this.metrics)
  }

  /**
   * 获取慢请求列表
   */
  getSlowRequests(limit: number = 50): SlowRequestEvent[] {
    return this.slowRequests.slice(-limit)
  }

  /**
   * 重置指标
   */
  reset(channel?: string): void {
    if (channel) {
      this.metrics.delete(channel)
    } else {
      this.metrics.clear()
      this.slowRequests = []
      this.aggregatedStats.clear()
      this.lastLogTime.clear()
    }
  }

  /**
   * 清理资源（进程退出时调用）
   */
  dispose(): void {
    if (this.aggregatedLogTimer) {
      clearInterval(this.aggregatedLogTimer)
      this.aggregatedLogTimer = null
    }
    // 退出前刷新聚合统计
    this.flushAggregatedStats()
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): {
    summary: {
      totalChannels: number
      totalRequests: number
      avgDuration: number
      slowRequestCount: number
    }
    slowestChannels: Array<{
      channel: string
      avgDuration: number
      totalRequests: number
    }>
  } {
    const allMetrics = Array.from(this.metrics.values())

    const summary = {
      totalChannels: this.metrics.size,
      totalRequests: allMetrics.reduce((sum, m) => sum + m.totalRequests, 0),
      avgDuration:
        allMetrics.length > 0
          ? allMetrics.reduce((sum, m) => sum + m.avgDuration, 0) / allMetrics.length
          : 0,
      slowRequestCount: allMetrics.reduce((sum, m) => sum + m.slowRequests, 0)
    }

    const slowestChannels = allMetrics
      .filter(m => m.totalRequests >= 10) // 至少 10 个请求才纳入统计
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10)
      .map(m => ({
        channel: m.channel,
        avgDuration: Math.round(m.avgDuration * 100) / 100,
        totalRequests: m.totalRequests
      }))

    return { summary, slowestChannels }
  }

  private getOrCreateMetrics(channel: string): PerformanceMetrics {
    if (!this.metrics.has(channel)) {
      this.metrics.set(channel, {
        channel,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        slowRequests: 0,
        lastRequestTime: 0
      })
    }
    return this.metrics.get(channel)!
  }

  private recordSlowRequest(channel: string, duration: number, error?: string): void {
    const event: SlowRequestEvent = {
      channel,
      requestId: generateShortId(),
      duration,
      timestamp: Date.now(),
      error
    }

    this.slowRequests.push(event)

    // 限制慢请求记录数量
    if (this.slowRequests.length > 100) {
      this.slowRequests = this.slowRequests.slice(-100)
    }

    // 更新聚合统计
    this.updateAggregatedStats(channel, duration)

    // 日志采样：检查是否应该记录日志
    if (!this.shouldLog(channel)) {
      return
    }

    // 记录日志
    const level = duration >= VERY_SLOW_REQUEST_THRESHOLD ? 'error' : 'warn'
    const message = `[Performance] Slow IPC request: ${channel} took ${duration}ms${
      error ? ` (error: ${error})` : ''
    }`

    if (level === 'error') {
      logger.error(message)
    } else {
      logger.warn(message)
    }
  }

  /**
   * 更新聚合统计
   */
  private updateAggregatedStats(channel: string, duration: number): void {
    const stats = this.aggregatedStats.get(channel) || { count: 0, totalDuration: 0 }
    stats.count++
    stats.totalDuration += duration
    this.aggregatedStats.set(channel, stats)
  }

  /**
   * 日志采样检查 - 避免同一通道重复告警
   */
  private shouldLog(channel: string): boolean {
    const now = Date.now()
    const lastLog = this.lastLogTime.get(channel) || 0

    if (now - lastLog >= LOG_SAMPLE_INTERVAL) {
      this.lastLogTime.set(channel, now)
      return true
    }
    return false
  }

  /**
   * 启动聚合日志定时器
   */
  private startAggregatedLogTimer(): void {
    this.aggregatedLogTimer = setInterval(() => {
      this.flushAggregatedStats()
    }, AGGREGATED_LOG_INTERVAL)

    // 防止定时器阻止进程退出
    if (this.aggregatedLogTimer) {
      this.aggregatedLogTimer.unref()
    }
  }

  /**
   * 刷新聚合统计 - 输出汇总日志
   */
  private flushAggregatedStats(): void {
    if (this.aggregatedStats.size === 0) {
      return
    }

    const entries = Array.from(this.aggregatedStats.entries())
      .filter(([, stats]) => stats.count > 0)
      .sort((a, b) => b[1].count - a[1].count)

    if (entries.length > 0) {
      const summary = entries
        .map(([channel, stats]) => {
          const avg = Math.round(stats.totalDuration / stats.count)
          return `${channel}: ${stats.count} 次 (平均 ${avg}ms)`
        })
        .join('; ')
      logger.info(
        `[Performance] 慢请求汇总 (${AGGREGATED_LOG_INTERVAL / 1000 / 60} 分钟): ${summary}`
      )
    }

    this.aggregatedStats.clear()
  }
}

// ========== 辅助函数 ==========

/**
 * 判断是否是高频通道（避免日志 spam）
 */
const HIGH_FREQUENCY_CHANNELS = new Set([
  'lyric-time-update',
  'player-sync-state',
  'music-playing-check'
])

function isHighFrequencyChannel(channel: string): boolean {
  return HIGH_FREQUENCY_CHANNELS.has(channel)
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 8)
}

// ========== 性能监控中间件 ==========

export const performanceMiddleware: IpcMiddleware<'invoke' | 'send'> = {
  name: 'performance',
  type: 'invoke',

  async process(channel, _data, next, context: IpcMiddlewareContext) {
    const monitor = PerformanceMonitor.getInstance()
    const startTime = context.startTime

    // 高频通道跳过性能监控，避免开销和日志 spam
    const isHighFrequency = isHighFrequencyChannel(channel)

    try {
      await next()

      const duration = Date.now() - startTime

      // 高频通道跳过指标记录
      if (!isHighFrequency) {
        monitor.recordCompletion(channel, duration, true)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 高频通道跳过指标记录
      if (!isHighFrequency) {
        monitor.recordCompletion(channel, duration, false, errorMessage)
      }

      // 错误情况下的慢请求告警（同样经过采样）
      if (duration >= SLOW_REQUEST_THRESHOLD) {
        const level = duration >= VERY_SLOW_REQUEST_THRESHOLD ? 'error' : 'warn'
        const message = `[Performance] Slow IPC request failed: ${channel} [${context.requestId}] took ${duration}ms: ${errorMessage}`
        if (level === 'error') {
          logger.error(message)
        } else {
          logger.warn(message)
        }
      }

      throw error
    }
  }
}

// ========== 导出监控 API ==========

export const performanceMonitor = PerformanceMonitor.getInstance()

// 函数重载：区分有参数和无参数时的返回类型
export function getPerformanceMetrics(channel: string): PerformanceMetrics | undefined
export function getPerformanceMetrics(): Map<string, PerformanceMetrics>
export function getPerformanceMetrics(channel?: string) {
  if (channel) {
    return performanceMonitor.getMetrics(channel)
  }
  return performanceMonitor.getAllMetrics()
}

export function getSlowRequests(limit?: number) {
  return performanceMonitor.getSlowRequests(limit)
}

export function getPerformanceReport() {
  return performanceMonitor.getPerformanceReport()
}

export function resetPerformanceMetrics(channel?: string) {
  performanceMonitor.reset(channel)
}

/**
 * 清理性能监控资源（进程退出时调用）
 */
export function disposePerformanceMonitor(): void {
  performanceMonitor.dispose()
}
