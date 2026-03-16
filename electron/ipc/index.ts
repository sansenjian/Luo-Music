/**
 * IPC 妯″潡缁熶竴瀵煎嚭
 *
 * 娉ㄦ剰锛氭鏂囦欢鐢ㄤ簬浠?electron/ 鐩綍瀵煎叆鏃舵彁渚涙纭殑璺緞
 */

// 鏍稿績鏈嶅姟
export { ipcService, IpcService } from './IpcService'
export type { IpcMiddleware, IpcMiddlewareContext, IpcServiceConfig } from './IpcService'

// 閫氶亾瀹氫箟锛堜笌 shared/protocol/channels 淇濇寔涓€鑷达級
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

// 绫诲瀷瀹氫箟
export * from './types'

// 涓棿浠?
export { errorMiddleware } from './middleware/error'
export { loggerMiddleware } from './middleware/logger'

// 澶勭悊鍣?
export { registerWindowHandlers } from './handlers/window.handler'
export { registerCacheHandlers } from './handlers/cache.handler'
export { registerPlayerHandlers } from './handlers/player.handler'
export { registerServiceHandlers } from './handlers/service.handler'
export { registerApiHandlers } from './handlers/api.handler'
export { registerLyricHandlers } from './handlers/lyric.handler'

// 宸ュ叿
export {
  executeWithRetry,
  getCache,
  setCache,
  clearGatewayCache,
  getGatewayCacheStatus
} from './utils/gatewayCache.ts'

