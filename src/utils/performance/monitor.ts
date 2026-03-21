import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

import { EventEmitter, type Event } from '../../base/common/event/event'
import { Disposable, DisposableStore } from '../../base/common/lifecycle/disposable'

interface ExtendedPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

export type PerformanceMemorySnapshot = {
  usedJSHeapSize: number
  totalJSHeapSize: number
}

export type PerformanceMetricsSnapshot = Record<
  string,
  number | PerformanceMemorySnapshot | null
> & {
  fps: number
  memory: PerformanceMemorySnapshot | null
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor

  private readonly onDidChangeMetricsEmitter = new EventEmitter<PerformanceMetricsSnapshot>()

  private fps = 0
  private frameCount = 0
  private lastTime = performance.now()
  private isMonitoring = false
  private metrics: Record<string, number> = {}
  private frameRequestId: number | null = null
  private memoryIntervalId: ReturnType<typeof setInterval> | null = null
  private webVitalsInitialized = false
  private runtimeDisposables: DisposableStore | null = null

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }

    return PerformanceMonitor.instance
  }

  public readonly onDidChangeMetrics: Event<PerformanceMetricsSnapshot> =
    this.onDidChangeMetricsEmitter.event

  public init(): void {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true
    this.runtimeDisposables = new DisposableStore()

    if (!this.webVitalsInitialized) {
      this.initWebVitals()
      this.webVitalsInitialized = true
    }

    this.startFPSMonitor()
    this.startMemoryMonitor()

    console.log('[Performance] Monitor initialized')
  }

  public stop(): void {
    if (!this.isMonitoring && this.runtimeDisposables === null) {
      return
    }

    this.isMonitoring = false
    this.runtimeDisposables?.dispose()
    this.runtimeDisposables = null
  }

  public dispose(): void {
    this.stop()
    this.fps = 0
    this.frameCount = 0
    this.lastTime = performance.now()
  }

  private initWebVitals(): void {
    const reportHandler = (metric: Metric) => {
      this.metrics[metric.name] = metric.value
      this.emitMetrics()

      if (process.env.NODE_ENV === 'development') {
        console.groupCollapsed(`[Performance] ${metric.name}`)
        console.log(`Value: ${Math.round(metric.value)}`)
        console.log(`Rating: ${metric.rating}`)
        console.log(`Delta: ${Math.round(metric.delta)}`)
        console.log(`ID: ${metric.id}`)
        console.groupEnd()
      }
    }

    onCLS(reportHandler)
    onINP(reportHandler)
    onLCP(reportHandler)
    onFCP(reportHandler)
    onTTFB(reportHandler)
  }

  private startFPSMonitor(): void {
    if (!this.runtimeDisposables) {
      return
    }

    const measureFPS = (currentTime: number) => {
      if (!this.isMonitoring) {
        this.frameRequestId = null
        return
      }

      this.frameCount += 1
      const elapsed = currentTime - this.lastTime

      if (elapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / elapsed)
        this.frameCount = 0
        this.lastTime = currentTime
        this.emitMetrics()

        if (this.fps < 30 && document.visibilityState === 'visible') {
          console.warn(`[Performance] Low FPS detected: ${this.fps}`)
        }
      }

      this.frameRequestId = requestAnimationFrame(measureFPS)
    }

    this.frameRequestId = requestAnimationFrame(measureFPS)
    this.runtimeDisposables.add(
      Disposable.from(() => {
        if (this.frameRequestId !== null) {
          cancelAnimationFrame(this.frameRequestId)
          this.frameRequestId = null
        }
      })
    )
  }

  private startMemoryMonitor(): void {
    if (!this.runtimeDisposables) {
      return
    }

    if (!(performance as ExtendedPerformance).memory) {
      console.warn('[Performance] Memory API not supported in this browser environment')
      return
    }

    this.memoryIntervalId = setInterval(() => {
      if (!this.isMonitoring) {
        return
      }

      const memory = (performance as ExtendedPerformance).memory
      if (!memory) {
        return
      }

      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024)
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
      const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit

      this.emitMetrics()

      if (usageRatio > 0.8) {
        console.warn(
          `[Performance] High memory usage: ${usedMB}MB / ${limitMB}MB (${Math.round(usageRatio * 100)}%)`
        )
      }
    }, 10000)

    this.runtimeDisposables.add(
      Disposable.from(() => {
        if (this.memoryIntervalId !== null) {
          clearInterval(this.memoryIntervalId)
          this.memoryIntervalId = null
        }
      })
    )
  }

  public getMetrics(): PerformanceMetricsSnapshot {
    return {
      fps: this.fps,
      ...this.metrics,
      memory: (performance as ExtendedPerformance).memory
        ? {
            usedJSHeapSize: (performance as ExtendedPerformance).memory!.usedJSHeapSize,
            totalJSHeapSize: (performance as ExtendedPerformance).memory!.totalJSHeapSize
          }
        : null
    }
  }

  private emitMetrics(): void {
    this.onDidChangeMetricsEmitter.fire(this.getMetrics())
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance()
