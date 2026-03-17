import { getService, registerService, resetServices } from './registry'
import { createApiService, type ApiService } from './apiService'
import { createLoggerService, type LoggerService } from './loggerService'
import { createErrorService, type ErrorService } from './errorService'
import { createConfigService, type ConfigService } from './configService'
import { createContextKeyService, type ContextKeyService } from './contextKeyService'
import { createPlatformService, type PlatformService } from './platformService'
import { createCommandService, type CommandService } from './commandService'
import {
  IPlatformService,
  IApiService,
  ILoggerService,
  IErrorService,
  IConfigService,
  IContextKeyService,
  ICommandService
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
  type ServiceIdentifier
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
}>

/**
 * 注册服务 - 支持两种调用方式
 * @param overrides 覆盖服务（可选）
 * @param useNewApi 是否使用新的 ServiceIdentifier API（默认 true）
 */
export function setupServices(overrides: ServiceOverrides = {}, useNewApi: boolean = true): void {
  const hasOverrides = Object.keys(overrides).length > 0
  if (initialized && !hasOverrides) {
    return
  }

  if (hasOverrides) {
    resetServices()
    initialized = false
  }

  // 使用新的 ServiceIdentifier API（类型安全）
  if (useNewApi) {
    registerService(IPlatformService, createPlatformService)
    registerService(IApiService, createApiService)
    registerService(ILoggerService, createLoggerService)
    registerService(IErrorService, createErrorService)
    registerService(IConfigService, createConfigService)
    registerService(IContextKeyService, createContextKeyService)
    registerService(ICommandService, createCommandService)

    if (overrides.platform) {
      registerService(IPlatformService, () => overrides.platform as PlatformService)
    }
    if (overrides.api) {
      registerService(IApiService, () => overrides.api as ApiService)
    }
    if (overrides.logger) {
      registerService(ILoggerService, () => overrides.logger as LoggerService)
    }
    if (overrides.error) {
      registerService(IErrorService, () => overrides.error as ErrorService)
    }
    if (overrides.config) {
      registerService(IConfigService, () => overrides.config as ConfigService)
    }
    if (overrides.context) {
      registerService(IContextKeyService, () => overrides.context as ContextKeyService)
    }
    if (overrides.command) {
      registerService(ICommandService, () => overrides.command as CommandService)
    }
  } else {
    // 向后兼容：使用字符串 ID
    registerService('platform', createPlatformService)
    registerService('api', createApiService)
    registerService('logger', createLoggerService)
    registerService('error', createErrorService)
    registerService('config', createConfigService)
    registerService('context', createContextKeyService)
    registerService('command', createCommandService)

    if (overrides.platform) {
      registerService('platform', () => overrides.platform as PlatformService)
    }
    if (overrides.api) {
      registerService('api', () => overrides.api as ApiService)
    }
    if (overrides.logger) {
      registerService('logger', () => overrides.logger as LoggerService)
    }
    if (overrides.error) {
      registerService('error', () => overrides.error as ErrorService)
    }
    if (overrides.config) {
      registerService('config', () => overrides.config as ConfigService)
    }
    if (overrides.context) {
      registerService('context', () => overrides.context as ContextKeyService)
    }
    if (overrides.command) {
      registerService('command', () => overrides.command as CommandService)
    }
  }

  initialized = true
}

export type {
  ApiService,
  CommandService,
  ConfigService,
  ContextKeyService,
  ErrorService,
  LoggerService,
  PlatformService
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
 * 服务访问助手 - 使用新的 ServiceIdentifier API（类型安全）
 */
export const services = {
  platform: (): PlatformService => {
    setupServices()
    return getService<PlatformService>(IPlatformService)
  },
  api: (): ApiService => {
    setupServices()
    return getService<ApiService>(IApiService)
  },
  error: (): ErrorService => {
    setupServices()
    return getService<ErrorService>(IErrorService)
  },
  config: (): ConfigService => {
    setupServices()
    return getService<ConfigService>(IConfigService)
  },
  context: (): ContextKeyService => {
    setupServices()
    return getService<ContextKeyService>(IContextKeyService)
  },
  logger: (): LoggerService => {
    setupServices()
    return getService<LoggerService>(ILoggerService)
  },
  commands: (): CommandService => {
    setupServices()
    return getService<CommandService>(ICommandService)
  }
}
