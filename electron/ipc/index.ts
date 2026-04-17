/**
 * IPC 模块统一导出
 *
 * 注意：此文件用于从 electron/ 目录导入时提供正确的路径
 */

// 核心服务
export { ipcService, IpcService } from './IpcService'
export type { IpcMiddleware, IpcMiddlewareContext, IpcServiceConfig } from './IpcService'

// 通道定义（与 shared/protocol/channels 保持一致）
export {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  RECEIVE_CHANNELS,
  VALID_SEND_CHANNELS,
  VALID_RECEIVE_CHANNELS,
  VALID_INVOKE_CHANNELS,
  isValidSendChannel,
  isValidReceiveChannel,
  isValidInvokeChannel
} from '../shared/protocol/channels.ts'

// 类型定义
export * from './types'

// 中间件
export { errorMiddleware } from './middleware/error'
export { loggerMiddleware } from './middleware/logger'
export { performanceMiddleware } from './middleware/performance'

// 性能监控 API
export {
  getPerformanceMetrics,
  getSlowRequests,
  getPerformanceReport,
  resetPerformanceMetrics,
  disposePerformanceMonitor
} from './middleware'
export type { PerformanceMetrics, SlowRequestEvent } from './middleware'

// 处理器
export { registerWindowHandlers } from './handlers/window.handler'
export { registerCacheHandlers } from './handlers/cache.handler'
export { registerConfigHandlers } from './handlers/config.handler'
export { registerPlayerHandlers } from './handlers/player.handler'
export { registerServiceHandlers } from './handlers/service.handler'
export { registerApiHandlers } from './handlers/api.handler'
export { registerLyricHandlers } from './handlers/lyric.handler'
export { registerLogHandlers } from './handlers/log.handler'
export { registerLocalLibraryHandlers } from './handlers/localLibrary.handler'

// 工具
export {
  executeWithRetry,
  getCache,
  setCache,
  clearGatewayCache,
  getGatewayCacheStatus
} from './utils/gatewayCache.ts'
