/**
 * HTTP 请求相关常量定义
 *
 * 统一管理 HTTP 请求的超时、重试、缓存等常量
 */

/**
 * Cookie 缓存有效期 (毫秒)
 *
 * 避免频繁读取用户 store 获取 cookie
 */
export const HTTP_COOKIE_CACHE_TTL = 5000

/**
 * 默认超时时间 (毫秒)
 */
export const HTTP_DEFAULT_TIMEOUT = 30000

/**
 * 默认重试次数
 * 减少重试以避免在外部服务不可用时长时间占用 IPC 通道，导致后续请求排队超时
 */
export const HTTP_DEFAULT_RETRY_COUNT = 1

/**
 * 默认重试延迟 (毫秒)
 */
export const HTTP_DEFAULT_RETRY_DELAY = 1000

/**
 * API 服务端口配置
 */
export const NETEASE_API_PORT = 14532
export const QQ_API_PORT = 3200

/**
 * 开发环境 API 服务器地址
 */
export const DEV_API_SERVER = `http://127.0.0.1:${NETEASE_API_PORT}`

/**
 * QQ 音乐 API 服务器地址
 */
export const QQ_API_SERVER = `http://127.0.0.1:${QQ_API_PORT}`

/**
 * 请求头配置
 */
export const HTTP_HEADERS = {
  'Content-Type': 'application/json'
} as const

/**
 * HTTP 方法枚举
 */
export enum HttpMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
  PATCH = 'patch'
}
