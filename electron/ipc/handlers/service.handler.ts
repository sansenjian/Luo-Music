/**
 * 服务管理 IPC 处理器
 */

import { INVOKE_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import type { ServiceManager } from '../../ServiceManager'
import type { ServiceStatusType } from '../../types/service'
import type { ServiceStatus, ServiceStatusResponse } from '../types'

function convertServiceStatusType(type: ServiceStatusType | null): ServiceStatus {
  if (type === null || type === undefined) {
    return 'stopped'
  }
  if (type === 'running') {
    return 'running'
  }
  if (
    type === 'pending' ||
    type === 'starting' ||
    type === 'stopping' ||
    type === 'stopped' ||
    type === 'unavailable'
  ) {
    return 'stopped'
  }
  return 'error'
}

function toServiceStatusResponse(
  status: ReturnType<ServiceManager['getServiceStatus']>
): ServiceStatusResponse {
  if (status === null) {
    return { status: 'stopped' }
  }

  return {
    status: convertServiceStatusType(status.status),
    port: status.port
  }
}

export function registerServiceHandlers(serviceManager: ServiceManager): void {
  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_GET_STATUS, async (serviceId: string) => {
    const status = await serviceManager.getServiceStatus(serviceId)
    return toServiceStatusResponse(status)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_START, async (serviceId: string) => {
    try {
      await serviceManager.startService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_STOP, async (serviceId: string) => {
    try {
      await serviceManager.stopService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_STATUS_ALL, async () => {
    const internalStatus = await serviceManager.getAllServiceStatus()
    const result: Record<string, ServiceStatus> = {}
    for (const [key, value] of Object.entries(internalStatus)) {
      result[key] = convertServiceStatusType(value.status)
    }
    return result
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_RESTART, async (serviceId: string) => {
    try {
      await serviceManager.restartService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.SERVICE_HEALTH, async (serviceId: string) => {
    try {
      const healthResult = await serviceManager.checkServiceHealth(serviceId)
      const healthy = healthResult.healthy
      return {
        healthy,
        message: healthy ? 'Service is healthy' : 'Service health check failed'
      }
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Health check failed'
      }
    }
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.SERVICE_UPDATE_CONFIG,
    async (serviceId: string, config: unknown) => {
      try {
        await serviceManager.updateServiceConfig(serviceId, config)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )
}
