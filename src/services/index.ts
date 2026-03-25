import {
  activateRegisteredServices,
  activateService as activateRegisteredService,
  deactivateRegisteredServices,
  deactivateService as deactivateRegisteredService,
  getService,
  registerService,
  resetServices,
  resetServicesAsync as resetRegisteredServicesAsync
} from './registry'
import { createApiService, type ApiService } from './apiService'
import { createLoggerService, type LoggerService } from './loggerService'
import { createErrorService, type ErrorService } from './errorService'
import { createConfigService, type ConfigService } from './configService'
import { createContextKeyService, type ContextKeyService } from './contextKeyService'
import { createPlatformService, type PlatformService } from './platformService'
import { createCommandService, type CommandService } from './commandService'
import { createPlayerService, type PlayerService } from './playerService'
import { createMusicService, type MusicService } from './musicService'
import { createStorageService, type StorageService } from './storageService'
import {
  IPlatformService,
  IApiService,
  ILoggerService,
  IErrorService,
  IConfigService,
  IContextKeyService,
  ICommandService,
  IPlayerService,
  IMusicService,
  IStorageService,
  type ServiceIdentifier
} from './types'

// 导出装饰器相关（从 decorators.ts 导出）
// inject = 属性注入装饰器 (PropertyDecorator)
export {
  createDecorator,
  inject,
  useService,
  createService,
  IPlatformService,
  IApiService,
  ILoggerService,
  IErrorService,
  IConfigService,
  IContextKeyService,
  ICommandService,
  IPlayerService,
  IMusicService,
  IStorageService
} from './decorators'

// 导出依赖注入容器（injector.ts）
// injectParam = 构造函数参数注入装饰器 (ParameterDecorator)
export {
  Injector,
  AnnotatedInjector,
  getInjector,
  getAnnotatedInjector,
  createInstance,
  createAnnotatedInstance,
  injectParam,
  type InstantiateOptions
} from './injector'

let initialized = false

export type ServiceOverrides = Partial<{
  platform: PlatformService
  api: ApiService
  logger: LoggerService
  error: ErrorService
  config: ConfigService
  context: ContextKeyService
  command: CommandService
  player: PlayerService
  music: MusicService
  storage: StorageService
}>

type ServiceKey = keyof ServiceOverrides

/**
 * 服务注册配置
 */
interface ServiceConfig<T> {
  identifier: ServiceIdentifier<T>
  factory: () => T
  overrideKey: keyof ServiceOverrides
}

/**
 * 服务注册表 - 单一数据源
 */
const SERVICE_REGISTRY: ServiceConfig<unknown>[] = [
  {
    identifier: IPlatformService,
    factory: createPlatformService,
    overrideKey: 'platform'
  },
  {
    identifier: IApiService,
    factory: createApiService,
    overrideKey: 'api'
  },
  {
    identifier: ILoggerService,
    factory: createLoggerService,
    overrideKey: 'logger'
  },
  {
    identifier: IErrorService,
    factory: createErrorService,
    overrideKey: 'error'
  },
  {
    identifier: IConfigService,
    factory: createConfigService,
    overrideKey: 'config'
  },
  {
    identifier: IContextKeyService,
    factory: createContextKeyService,
    overrideKey: 'context'
  },
  {
    identifier: ICommandService,
    factory: createCommandService,
    overrideKey: 'command'
  },
  {
    identifier: IPlayerService,
    factory: createPlayerService,
    overrideKey: 'player'
  },
  {
    identifier: IMusicService,
    factory: createMusicService,
    overrideKey: 'music'
  },
  {
    identifier: IStorageService,
    factory: createStorageService,
    overrideKey: 'storage'
  }
]

const SERVICE_IDENTIFIERS: Record<ServiceKey, ServiceIdentifier<unknown>> = {
  platform: IPlatformService,
  api: IApiService,
  logger: ILoggerService,
  error: IErrorService,
  config: IConfigService,
  context: IContextKeyService,
  command: ICommandService,
  player: IPlayerService,
  music: IMusicService,
  storage: IStorageService
}

/**
 * 注册所有服务
 */
function registerAllServices(overrides: ServiceOverrides): void {
  for (const config of SERVICE_REGISTRY) {
    const override = overrides[config.overrideKey]
    if (override) {
      registerService(config.identifier, () => override)
    } else {
      registerService(config.identifier, config.factory)
    }
  }
}

/**
 * 注册服务
 * @param overrides 覆盖服务（可选）
 */
export function setupServices(overrides: ServiceOverrides = {}): void {
  const hasOverrides = Object.keys(overrides).length > 0

  if (initialized && !hasOverrides) {
    return
  }

  if (hasOverrides) {
    resetServices()
    initialized = false
    registrationGeneration++ // 增加注册代数，使缓存的实例失效
  }

  registerAllServices(overrides)
  initialized = true
}

export type {
  ApiService,
  CommandService,
  ConfigService,
  ContextKeyService,
  ErrorService,
  LoggerService,
  MusicService,
  PlatformService,
  PlayerService,
  StorageService
}
export { getService }
export type { ServiceLifecycle } from './registry'
export {
  activateRegisteredServices,
  activateRegisteredService,
  deactivateRegisteredServices,
  deactivateRegisteredService
}

function resolveServiceIdentifiers(serviceKeys?: ServiceKey[]): ServiceIdentifier<unknown>[] {
  if (!serviceKeys || serviceKeys.length === 0) {
    return Object.values(SERVICE_IDENTIFIERS)
  }

  return serviceKeys.map(serviceKey => SERVICE_IDENTIFIERS[serviceKey])
}

export async function activateServices(serviceKeys?: ServiceKey[]): Promise<void> {
  setupServices()
  await activateRegisteredServices(resolveServiceIdentifiers(serviceKeys))
}

export async function deactivateServices(serviceKeys?: ServiceKey[]): Promise<void> {
  await deactivateRegisteredServices(resolveServiceIdentifiers(serviceKeys))
}

export async function initializeServices(
  overrides: ServiceOverrides = {},
  serviceKeys?: ServiceKey[]
): Promise<void> {
  setupServices(overrides)
  await activateRegisteredServices(resolveServiceIdentifiers(serviceKeys))
}

export async function resetServicesAsync(): Promise<void> {
  await resetRegisteredServicesAsync()
  initialized = false
  registrationGeneration++ // 增加注册代数，使缓存的实例失效
}

// 导出性能监控功能
export {
  getServiceMetrics,
  getAllServiceMetrics,
  getPerformanceReport,
  printPerformanceReport,
  getSlowestServices,
  getMostUsedServices,
  enableMonitoring,
  disableMonitoring,
  resetMetrics
} from './performanceMonitor'

/**
 * 当前注册版本计数器 - 用于检测服务重置
 */
let registrationGeneration = 0

/**
 * 创建服务访问器函数
 */
function createServiceAccessor<T>(identifier: ServiceIdentifier<T>, init: () => void): () => T {
  let initialized = false
  let instance: T | null = null
  let cachedGeneration = 0

  return () => {
    try {
      // 检测服务是否被重置（注册代数不匹配）
      if (initialized && cachedGeneration !== registrationGeneration) {
        initialized = false
        instance = null
      }

      // 如果已初始化，直接返回缓存实例
      if (initialized && instance !== null) {
        return instance
      }

      // 初始化服务
      init()

      // 获取服务实例
      instance = getService<T>(identifier)
      initialized = true
      cachedGeneration = registrationGeneration

      return instance
    } catch (error) {
      const serviceName = typeof identifier === 'string' ? identifier : identifier.name
      const wrappedError = new Error(
        `[Services] Failed to access service "${serviceName}": ` +
          (error instanceof Error ? error.message : String(error))
      )
      wrappedError.cause = error
      throw wrappedError
    }
  }
}

/**
 * 服务访问助手 - 使用 ServiceIdentifier API（类型安全）
 */
export const services = {
  platform: createServiceAccessor(IPlatformService, setupServices),
  api: createServiceAccessor(IApiService, setupServices),
  error: createServiceAccessor(IErrorService, setupServices),
  config: createServiceAccessor(IConfigService, setupServices),
  context: createServiceAccessor(IContextKeyService, setupServices),
  logger: createServiceAccessor(ILoggerService, setupServices),
  commands: createServiceAccessor(ICommandService, setupServices),
  player: createServiceAccessor(IPlayerService, setupServices),
  music: createServiceAccessor(IMusicService, setupServices),
  storage: createServiceAccessor(IStorageService, setupServices)
}
