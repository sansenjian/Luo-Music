import { normalizeApiError } from '../utils/error/normalize'
import {
  createTimeoutController,
  isTimeoutError,
  getTimeoutForEndpoint,
  resolveTimeoutKey
} from '@/utils/http/timeoutConfig'

// Re-export for test compatibility
export { resolveTimeoutKey }

export type ApiService = {
  request(service: string, endpoint: string, params?: Record<string, unknown>): Promise<unknown>
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
          const timeout = getTimeoutForEndpoint(normalizedEndpoint)
          throw normalizeApiError({ message: `Request timeout after ${timeout}ms` }, service, {
            endpoint: normalizedEndpoint
          })
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    }
  }
}
