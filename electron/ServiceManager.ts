import type { AvailableService, ServiceConfig, ServiceStatus } from './types/service'
import logger from './logger'
import { BaseService } from './service/baseService'
import { NeteaseService, QQService } from './service/musicServices'
import { Mutex } from 'async-mutex'

export { BaseService, NeteaseService, QQService }

/**
 * 服务工厂函数类型
 */
export type ServiceFactory = (port: number) => BaseService

/**
 * 服务注册表接口
 */
export interface ServiceRegistry {
  register(serviceId: string, factory: ServiceFactory): void
  get(serviceId: string): BaseService | undefined
  has(serviceId: string): boolean
  getAll(): Map<string, BaseService>
  getFactory(serviceId: string): ServiceFactory | undefined
}

/**
 * 默认服务注册表实现
 */
export class DefaultServiceRegistry implements ServiceRegistry {
  private factories: Map<string, ServiceFactory> = new Map()
  private instances: Map<string, BaseService> = new Map()

  register(serviceId: string, factory: ServiceFactory): void {
    this.factories.set(serviceId, factory)
    logger.info(`[ServiceRegistry] Registered service factory: ${serviceId}`)
  }

  get(serviceId: string): BaseService | undefined {
    const existing = this.instances.get(serviceId)
    if (existing) {
      return existing
    }

    const factory = this.factories.get(serviceId)
    if (!factory) {
      return undefined
    }

    // 使用默认端口创建实例
    const service = factory(0)
    this.instances.set(serviceId, service)
    return service
  }

  has(serviceId: string): boolean {
    return this.factories.has(serviceId)
  }

  getAll(): Map<string, BaseService> {
    return new Map(this.instances)
  }

  getFactory(serviceId: string): ServiceFactory | undefined {
    return this.factories.get(serviceId)
  }
}

/**
 * 服务管理器 - 统一管理所有音乐平台服务
 */
export class ServiceManager {
  private registry: ServiceRegistry
  private services: Map<string, BaseService> = new Map()
  private config: ServiceConfig | null = null
  private startTasks: Map<string, Promise<void>> = new Map()
  private startTaskMutex = new Mutex() // 启动任务互斥锁

  constructor(registry?: ServiceRegistry) {
    this.registry = registry || new DefaultServiceRegistry()
    this.registerBuiltInServices()
  }

  /**
   * 注册内置服务（使用工厂模式）
   */
  private registerBuiltInServices(): void {
    // QQ 音乐服务工厂
    this.registry.register('qq', (port: number) => new QQService(port || 3200))

    // 网易云音乐服务工厂
    this.registry.register('netease', (port: number) => new NeteaseService(port || 14532))
  }

  /**
   * 注册外部服务（支持服务发现）
   * @param serviceId 服务标识
   * @param factory 服务工厂函数
   */
  registerService(serviceId: string, factory: ServiceFactory): void {
    this.registry.register(serviceId, factory)
  }

  private isServiceEnabled(serviceId: string): boolean {
    return this.config?.services[serviceId]?.enabled ?? true
  }

  /**
   * 初始化服务管理器
   */
  async initialize(config: ServiceConfig): Promise<void> {
    this.config = config
    logger.info('[ServiceManager] Initializing...')

    // 为配置中的每个服务创建实例（使用工厂模式）
    for (const [serviceId, serviceConfig] of Object.entries(config.services)) {
      if (!this.services.has(serviceId) && this.registry.has(serviceId)) {
        const factory = this.registry.getFactory(serviceId)
        if (factory) {
          const service = factory(serviceConfig?.port || 0)
          this.services.set(serviceId, service)
          logger.info(`[ServiceManager] Created service instance: ${serviceId}`)
        }
      }
    }

    const startupTasks = Object.entries(config.services)
      .filter(([, serviceConfig]) => serviceConfig.enabled)
      .map(async ([serviceId]) => {
        try {
          await this.startService(serviceId)
        } catch (error) {
          logger.error(`[ServiceManager] Failed to start ${serviceId}:`, error)
        }
      })

    await Promise.all(startupTasks)

    logger.info('[ServiceManager] Initialization complete')
  }

  /**
   * 启动服务 - 使用互斥锁保护避免竞态条件
   */
  async startService(serviceId: string): Promise<void> {
    // 使用互斥锁保护检查-然后-执行模式
    const startTask = await this.startTaskMutex.runExclusive(async () => {
      // 先检查是否已有进行中的启动任务
      const pendingStart = this.startTasks.get(serviceId)
      if (pendingStart) {
        return pendingStart
      }

      let service = this.services.get(serviceId)
      if (!service) {
        // 尝试从注册表获取并创建实例
        const factory = this.registry.getFactory(serviceId)
        if (factory) {
          const port = this.config?.services[serviceId]?.port || 0
          service = factory(port)
          this.services.set(serviceId, service)
          logger.info(`[ServiceManager] Created and starting service instance: ${serviceId}`)
        } else {
          throw new Error(`Service ${serviceId} not found`)
        }
      }

      const { status } = service.getStatus()
      if (status === 'starting' || status === 'running') {
        logger.warn(
          `[ServiceManager] Skip duplicate start for ${serviceId}, current status: ${status}`
        )
        return Promise.resolve()
      }

      const task = service.start().finally(() => {
        this.startTasks.delete(serviceId)
      })

      this.startTasks.set(serviceId, task)
      return task
    })

    await startTask
  }

  /**
   * 停止服务
   */
  async stopService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId)
    if (!service) {
      throw new Error(`Service ${serviceId} not found`)
    }
    await service.stop()
  }

  /**
   * 重启服务
   */
  async restartService(serviceId: string): Promise<void> {
    await this.stopService(serviceId)
    await this.startService(serviceId)
  }

  /**
   * 获取服务状态
   */
  getServiceStatus(serviceId: string): ServiceStatus | null {
    const service = this.services.get(serviceId)
    return service ? service.getStatus() : null
  }

  /**
   * 获取所有可用服务
   */
  getAvailableServices(): Record<string, AvailableService | null> {
    const result: Record<string, AvailableService | null> = {}

    for (const [serviceId, service] of this.services) {
      const status = service.getStatus()
      if (status.enabled && service.isAlive()) {
        result[serviceId] = {
          status: 'ready',
          port: status.port,
          lastError: status.lastError
        }
      } else if (status.enabled && !service.isAlive()) {
        result[serviceId] = {
          status: 'error',
          port: status.port,
          lastError: status.lastError
        }
      } else {
        result[serviceId] = null
      }
    }

    return result
  }

  /**
   * 处理 API 请求（统一网关）
   */
  async handleRequest(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const serviceInstance = this.services.get(service)
    if (!serviceInstance) {
      throw new Error(`Service ${service} not found`)
    }
    if (!this.isServiceEnabled(service)) {
      throw new Error(`Service ${service} is disabled`)
    }
    if (!serviceInstance.isAlive()) {
      await this.startService(service)
    }
    if (!serviceInstance.isAlive()) {
      throw new Error(`Service ${service} is not available`)
    }
    return serviceInstance.handleRequest(endpoint, params)
  }

  /**
   * 停止所有服务
   */
  async stopAll(): Promise<void> {
    logger.info('[ServiceManager] Stopping all services...')
    for (const [serviceId, service] of this.services) {
      try {
        await service.stop()
      } catch (error) {
        logger.error(`[ServiceManager] Failed to stop ${serviceId}:`, error)
      }
    }
    logger.info('[ServiceManager] All services stopped')
  }

  /**
   * 停止所有服务（别名）
   */
  async stopAllServices(): Promise<void> {
    return this.stopAll()
  }

  /**
   * 启动所有已注册的服务
   */
  async startAllServices(): Promise<void> {
    logger.info('[ServiceManager] Starting all services...')
    for (const [serviceId] of this.services) {
      try {
        await this.startService(serviceId)
      } catch (error) {
        logger.error(`[ServiceManager] Failed to start ${serviceId}:`, error)
      }
    }
    logger.info('[ServiceManager] All services started')
  }

  /**
   * 获取所有服务状态
   */
  getAllServiceStatus(): Record<string, ServiceStatus> {
    const result: Record<string, ServiceStatus> = {}
    for (const [serviceId, service] of this.services) {
      result[serviceId] = service.getStatus()
    }
    return result
  }

  /**
   * 标记服务为运行状态（由外部启动时使用）
   */
  markServiceAsRunning(serviceId: string, port: number): void {
    const service = this.services.get(serviceId)
    if (service) {
      service.markAsRunning(port)
      logger.info(`[ServiceManager] Marked ${serviceId} as running on port ${port}`)
    } else {
      logger.warn(`[ServiceManager] Service ${serviceId} not found for marking as running`)
    }
  }

  /**
   * 检查服务健康状态
   */
  async checkServiceHealth(
    serviceId: string
  ): Promise<{ healthy: boolean; status: ServiceStatus | null }> {
    const service = this.services.get(serviceId)
    if (!service) {
      return { healthy: false, status: null }
    }

    const status = service.getStatus()
    const healthy = service.isAlive()

    return { healthy, status }
  }

  /**
   * 更新服务配置
   */
  updateServiceConfig(serviceId: string, config: unknown): void {
    logger.info(`[ServiceManager] Updating config for ${serviceId}:`, config)
    // 当前实现中，服务配置在初始化时确定。
    // 此方法预留用于动态配置更新。
    // 可以在未来扩展以支持热重载配置。
  }
}

export const serviceManager = new ServiceManager()
