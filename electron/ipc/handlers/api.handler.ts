import { INVOKE_CHANNELS } from '../../shared/protocol/channels.ts'
import type { ServiceManager } from '../../ServiceManager'
import logger from '../../logger'
import { ipcService } from '../IpcService'
import { executeWithRetry, getCache, setCache } from '../utils/gatewayCache.ts'

export function registerApiHandlers(serviceManager: ServiceManager): void {
  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_REQUEST,
    async ({
      service,
      endpoint,
      params,
      noCache
    }: {
      service: string
      endpoint: string
      params: Record<string, unknown>
      noCache?: boolean
    }) => {
      const context = `api:request ${service}:${endpoint}`

      if (!noCache) {
        const cachedData = getCache(service, endpoint, params)
        if (cachedData !== null) {
          return { success: true, data: cachedData, cached: true }
        }
      }

      try {
        const result = await executeWithRetry(
          () => serviceManager.handleRequest(service, endpoint, params),
          context
        )

        if (!noCache) {
          setCache(service, endpoint, params, result)
        }

        return { success: true, data: result, cached: false }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`[API Gateway] ${context} failed after retries:`, errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.API_GET_SERVICES, async () => {
    const services = serviceManager.getAvailableServices()
    return Promise.resolve(Object.keys(services).filter(key => services[key] !== null))
  })
}
