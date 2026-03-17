/**
 * 服务状态枚举
 */
export type ServiceStatusType =
  | 'pending'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'unavailable'

/**
 * 服务状态接口
 */
export interface ServiceStatus {
  serviceId: string
  enabled: boolean
  status: ServiceStatusType
  port?: number
  lastError?: string
  lastUpdate: number
}

/**
 * 单个服务配置
 */
export interface ServiceItemConfig {
  enabled: boolean
  port: number
}

/**
 * 服务配置接口
 */
export interface ServiceConfig {
  services: {
    [key: string]: ServiceItemConfig
  }
}

/**
 * 可用服务信息
 */
export interface AvailableService {
  status: 'ready' | 'error' | 'unavailable'
  port?: number
  lastError?: string
}

/**
 * 服务管理器接口
 */
export interface IServiceManager {
  initialize(config: ServiceConfig): Promise<void>
  startService(serviceId: string): Promise<void>
  stopService(serviceId: string): Promise<void>
  restartService(serviceId: string): Promise<void>
  getServiceStatus(serviceId: string): ServiceStatus | null
  getAvailableServices(): Record<string, AvailableService | null>
  handleRequest(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<unknown>
}
