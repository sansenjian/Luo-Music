import { getService, registerService, resetServices } from './registry'
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

// 导出依赖注入容器
export {
  Injector,
  AnnotatedInjector,
  Inject,
  getInjector,
  getAnnotatedInjector,
  createInstance,
  createAnnotatedInstance,
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
 * 创建服务访问器函数
 */
function createServiceAccessor<T>(identifier: ServiceIdentifier<T>, init: () => void): () => T {
  return () => {
    init()
    return getService<T>(identifier)
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
