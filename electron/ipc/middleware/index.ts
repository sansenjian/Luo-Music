/**
 * IPC 中间件统一导出
 */

export { errorMiddleware } from './error'
export { loggerMiddleware } from './logger'
export { performanceMiddleware } from './performance'

// 性能监控 API
export {
  getPerformanceMetrics,
  getSlowRequests,
  getPerformanceReport,
  resetPerformanceMetrics,
  disposePerformanceMonitor,
  performanceMonitor
} from './performance'

export type { PerformanceMetrics, SlowRequestEvent } from './performance'
