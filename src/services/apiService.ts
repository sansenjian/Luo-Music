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

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      return response.json()
    }
  }
}
