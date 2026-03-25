import type { ServiceManager } from '../../ServiceManager'
import { executeWithRetry, getCache, setCache } from '../utils/gatewayCache.ts'
import type { GatewayErrorDetails } from './api.contract'
import { normalizeEndpoint } from './api.validation'
import logger from '../../logger'

export async function requestServiceWithCache(
  serviceManager: ServiceManager,
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  noCache: boolean = false
): Promise<{ result: unknown; cached: boolean }> {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const context = `api:request ${service}:${normalizedEndpoint}`

  if (!noCache) {
    const cachedData = getCache(service, normalizedEndpoint, params)
    if (cachedData !== null) {
      return { result: cachedData, cached: true }
    }
  }

  const result = await executeWithRetry(
    () => serviceManager.handleRequest(service, normalizedEndpoint, params),
    context
  )

  if (!noCache) {
    // 异步设置缓存，不阻塞返回结果，但处理潜在错误
    setCache(service, normalizedEndpoint, params, result).catch(error => {
      logger.warn(`[API Gateway] Failed to set cache: ${error}`)
    })
  }

  return { result, cached: false }
}

export async function requestService(
  serviceManager: ServiceManager,
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  noCache: boolean = false
): Promise<unknown> {
  const { result } = await requestServiceWithCache(
    serviceManager,
    service,
    endpoint,
    params,
    noCache
  )
  return result
}

export function serializeErrorDetails(error: unknown): GatewayErrorDetails | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const typedError = error as {
    code?: unknown
    reason?: unknown
    response?: {
      status?: unknown
      data?: unknown
    }
  }

  const details: GatewayErrorDetails = {}

  if (typeof typedError.code === 'string') {
    details.code = typedError.code
  }

  if (typeof typedError.reason === 'string') {
    details.reason = typedError.reason
  }

  if (typeof typedError.response?.status === 'number') {
    details.status = typedError.response.status
  }

  if (typedError.response?.data !== undefined) {
    details.responseData = typedError.response.data
  }

  return Object.keys(details).length > 0 ? details : undefined
}
