import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals'

// 扩展 Performance 接口以包含 Chrome 的非标准 memory 属性
interface ExtendedPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private fps: number = 0
  private frameCount: number = 0
  private lastTime: number = performance.now()
  private isMonitoring: boolean = false
  private metrics: Record<string, number> = {}

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  public init() {
    if (this.isMonitoring) return
    this.isMonitoring = true

    // 1. Web Vitals 指标监控
    this.initWebVitals()

    // 2. FPS 监控
    this.startFPSMonitor()

    // 3. 内存监控 (每 10 秒检查一次)
    this.startMemoryMonitor()

    console.log('[Performance] Monitor initialized')
  }

  private initWebVitals() {
    const reportHandler = (metric: Metric) => {
      this.metrics[metric.name] = metric.value

      // 在开发环境下输出指标，或者当指标较差时告警
      if (process.env.NODE_ENV === 'development') {
        console.groupCollapsed(`[Performance] ${metric.name}`)
        console.log(`Value: ${Math.round(metric.value)}`)
        console.log(`Rating: ${metric.rating}`) // 'good' | 'needs-improvement' | 'poor'
        console.log(`Delta: ${Math.round(metric.delta)}`)
        console.log(`ID: ${metric.id}`)
        console.groupEnd()
      }

      // 如果需要，可以通过 IPC 发送给主进程记录日志
      // if (window.electron) {
      //   window.electron.send('performance-metric', metric);
      // }
    }

    onCLS(reportHandler)
    onINP(reportHandler)
    onLCP(reportHandler)
    onFCP(reportHandler)
    onTTFB(reportHandler)
  }

  private startFPSMonitor() {
    const measureFPS = (currentTime: number) => {
      if (!this.isMonitoring) return

      this.frameCount++
      const elapsed = currentTime - this.lastTime

      if (elapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / elapsed)
        this.frameCount = 0
        this.lastTime = currentTime

        // 如果 FPS 过低 (比如低于 30)，可以发出警告
        if (this.fps < 30 && document.visibilityState === 'visible') {
          console.warn(`[Performance] Low FPS detected: ${this.fps}`)
        }
      }

      requestAnimationFrame(measureFPS)
    }

    requestAnimationFrame(measureFPS)
  }

  private startMemoryMonitor() {
    if (!(performance as ExtendedPerformance).memory) {
      console.warn('[Performance] Memory API not supported in this browser environment')
      return
    }

    setInterval(() => {
      if (!this.isMonitoring) return

      const memory = (performance as ExtendedPerformance).memory
      if (memory) {
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024)
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024)

        // 如果内存使用率过高 (比如超过 80% limit 或绝对值过大)，发出警告
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit

        if (process.env.NODE_ENV === 'development') {
          // 开发模式下定期输出内存状态，方便观察泄漏
          // console.debug(`[Performance] Memory: ${usedMB}MB / ${totalMB}MB (Limit: ${limitMB}MB)`);
        }

        if (usageRatio > 0.8) {
          console.warn(
            `[Performance] High memory usage: ${usedMB}MB / ${limitMB}MB (${Math.round(usageRatio * 100)}%)`
          )
        }
      }
    }, 10000) // 每 10 秒检查一次
  }

  public getMetrics() {
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
}

export const performanceMonitor = PerformanceMonitor.getInstance()
