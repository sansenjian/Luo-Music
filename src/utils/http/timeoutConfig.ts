/**
 * HTTP 请求超时配置工具
 *
 * 根据不同 API 端点动态配置超时时间
 */

import { HTTP_DEFAULT_TIMEOUT } from '@/constants/http'

/**
 * 各 API 端点的超时配置 (毫秒)
 */
export const API_TIMEOUT_CONFIG: Record<string, number> = {
  // 长时间操作可以设置更长的超时
  'song/url': 45000,
  lyric: 45000,
  search: 45000,
  cloudsearch: 45000
} as const

/**
 * 根据端点解析超时配置键
 * @param endpoint API 端点路径
 * @returns 超时配置键
 */
export function resolveTimeoutKey(endpoint: string): keyof typeof API_TIMEOUT_CONFIG | string {
  const normalized = endpoint.replace(/^\/+/, '').split('?')[0] || ''

  if (normalized in API_TIMEOUT_CONFIG) {
    return normalized
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const twoSegmentKey = `${segments[0]}/${segments[1]}`
    if (twoSegmentKey in API_TIMEOUT_CONFIG) {
      return twoSegmentKey
    }
  }

  return segments[0] || normalized
}

/**
 * 获取指定端点的超时时间
 * @param endpoint API 端点路径
 * @returns 超时时间 (毫秒)
 */
export function getTimeoutForEndpoint(endpoint: string): number {
  const key = resolveTimeoutKey(endpoint)
  return (API_TIMEOUT_CONFIG as Record<string, number>)[key] ?? HTTP_DEFAULT_TIMEOUT
}

/**
 * 创建带超时的 AbortController
 * @param endpoint API 端点路径
 * @returns AbortController 和 timeoutId
 */
export function createTimeoutController(endpoint: string): {
  controller: AbortController
  timeoutId: ReturnType<typeof setTimeout>
} {
  const controller = new AbortController()
  const timeout = getTimeoutForEndpoint(endpoint)
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  return { controller, timeoutId }
}

/**
 * 判断错误是否为超时错误
 * @param error 错误对象
 * @returns 是否为超时错误
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
