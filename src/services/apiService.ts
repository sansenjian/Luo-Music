import { normalizeApiError } from '../utils/error/normalize'
import { HTTP_DEFAULT_TIMEOUT } from '@/constants/http'

export type ApiService = {
  request(service: string, endpoint: string, params?: Record<string, unknown>): Promise<unknown>
}

// 请求超时配置
const DEFAULT_TIMEOUT_MS = HTTP_DEFAULT_TIMEOUT
const TIMEOUT_CONFIG: Record<string, number> = {
  // 长时间操作可以设置更长的超时
  'song/url': 45000,
  'lyric': 45000,
  'search': 45000,
  'cloudsearch': 45000
}

function resolveTimeoutKey(endpoint: string): string {
  const normalized = endpoint.replace(/^\/+/, '').split('?')[0] || ''

  if (normalized in TIMEOUT_CONFIG) {
    return normalized
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const twoSegmentKey = `${segments[0]}/${segments[1]}`
    if (twoSegmentKey in TIMEOUT_CONFIG) {
      return twoSegmentKey
    }
  }

  return segments[0] || normalized
}

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)])

  if (entries.length === 0) {
    return ''
  }

  const search = new URLSearchParams(entries).toString()
  return `?${search}`
}

/**
 * 创建带超时的 AbortController
 */
function createTimeoutController(endpoint: string): {
  controller: AbortController
  timeoutId: ReturnType<typeof setTimeout>
} {
  const controller = new AbortController()
  const timeoutKey = resolveTimeoutKey(endpoint)
  const timeout = TIMEOUT_CONFIG[timeoutKey] ?? DEFAULT_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  return { controller, timeoutId }
}

/**
 * 判断错误是否为超时错误
 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function createApiService(): ApiService {
  return {
    async request(
      service: string,
      endpoint: string,
      params: Record<string, unknown> = {}
    ): Promise<unknown> {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            apiRequest?: (
              service: string,
              endpoint: string,
              params: Record<string, unknown>
            ) => Promise<unknown>
          }
        }
      ).electronAPI

      if (electronAPI?.apiRequest) {
        return electronAPI.apiRequest(service, endpoint, params)
      }

      const basePath = service === 'qq' ? '/qq-api' : '/api'
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      const url = `${basePath}${normalizedEndpoint}${buildQuery(params)}`

      const { controller, timeoutId } = createTimeoutController(normalizedEndpoint)

      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal
        })

        if (!response.ok) {
          throw normalizeApiError(
            {
              response: {
                status: response.status
              },
              message: `API request failed: ${response.status}`
            },
            service
          )
        }

        try {
          return await response.json()
        } catch (error) {
          throw normalizeApiError(error, service, { endpoint: normalizedEndpoint })
        }
      } catch (error) {
        if (isTimeoutError(error)) {
          const timeoutKey = resolveTimeoutKey(normalizedEndpoint)
          throw normalizeApiError(
            { message: `Request timeout after ${TIMEOUT_CONFIG[timeoutKey] ?? DEFAULT_TIMEOUT_MS}ms` },
            service,
            { endpoint: normalizedEndpoint }
          )
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    }
  }
}

export { resolveTimeoutKey }
