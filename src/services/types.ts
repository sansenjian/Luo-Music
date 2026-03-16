/**
 * 服务标识符接口 - 参考 VSCode 设计
 *
 * 用法：
 * ```typescript
 * const IApiService = createDecorator<ApiService>('IApiService')
 * const ILoggerService = createDecorator<LoggerService>('ILoggerService')
 * ```
 */
export interface ServiceIdentifier<T = unknown> {
  /**
   * 服务名称（用于错误报告和调试）
   */
  readonly name: string
  /**
   * Phantom 类型字段 - 仅用于 TypeScript 类型推断
   * 实际上不会存储任何值
   */
  readonly __type?: T
  /**
   * 服务品牌标识 - 用于运行时类型检查
   */
  readonly __brand?: symbol
}

/**
 * 服务标识符缓存
 */
const serviceIdentifiers = new Map<string, ServiceIdentifier<unknown>>()

/**
 * 创建服务标识符
 *
 * @param name - 服务名称（通常以 'I' 开头，如 'IApiService'）
 * @returns 服务标识符，可作为类型注解和依赖注入的 Key
 *
 * @example
 * ```typescript
 * const IApiService = createDecorator<ApiService>('IApiService')
 *
 * // 用作类型
 * function useApi(api: typeof IApiService.__type) { ... }
 *
 * // 用作依赖注入 Key
 * registerService(IApiService, createApiService)
 * const api = getService(IApiService)
 * ```
 */
export function createDecorator<T>(name: string): ServiceIdentifier<T> {
  const existing = serviceIdentifiers.get(name)
  if (existing) {
    return existing as ServiceIdentifier<T>
  }

  // 创建唯一的 brand 符号，用于运行时类型检查
  const brand = Symbol.for(`service:${name}`)

  const identifier: ServiceIdentifier<T> = {
    name,
    __brand: brand
  }

  serviceIdentifiers.set(name, identifier as ServiceIdentifier<unknown>)
  return identifier
}

/**
 * 预定义的核心服务标识符
 */
export const IPlatformService = createDecorator<
  import('./platformService').PlatformService
>('IPlatformService')

export const IApiService = createDecorator<
  import('./apiService').ApiService
>('IApiService')

export const ILoggerService = createDecorator<
  import('./loggerService').LoggerService
>('ILoggerService')

export const IErrorService = createDecorator<
  import('./errorService').ErrorService
>('IErrorService')

export const IConfigService = createDecorator<
  import('./configService').ConfigService
>('IConfigService')

export const IContextKeyService = createDecorator<
  import('./contextKeyService').ContextKeyService
>('IContextKeyService')

export const ICommandService = createDecorator<
  import('./commandService').CommandService
>('ICommandService')

/**
 * 所有核心服务的联合类型
 */
export type CoreServices = {
  platform: typeof IPlatformService
  api: typeof IApiService
  logger: typeof ILoggerService
  error: typeof IErrorService
  config: typeof IConfigService
  context: typeof IContextKeyService
  command: typeof ICommandService
}

/**
 * 服务 ID 字符串（保留向后兼容）
 */
export type ServiceId = keyof CoreServices

/**
 * 服务 ID 到 ServiceIdentifier 的映射（用于向后兼容）
 */
export const SERVICE_ID_MAP: Record<ServiceId, ServiceIdentifier<unknown>> = {
  platform: IPlatformService,
  api: IApiService,
  logger: ILoggerService,
  error: IErrorService,
  config: IConfigService,
  context: IContextKeyService,
  command: ICommandService
}

/**
 * 反向映射表：ServiceIdentifier -> ServiceId
 * 用于从装饰器传入的 ServiceIdentifier 获取短名称
 */
const REVERSE_SERVICE_ID_MAP = new Map<ServiceIdentifier<unknown>, ServiceId>([
  [IPlatformService, 'platform'],
  [IApiService, 'api'],
  [ILoggerService, 'logger'],
  [IErrorService, 'error'],
  [IConfigService, 'config'],
  [IContextKeyService, 'context'],
  [ICommandService, 'command']
])

/**
 * 从 ServiceIdentifier 获取服务短名称
 * @param identifier 服务标识符
 * @returns 服务短名称（如 'api', 'logger'）
 */
export function getServiceId<T>(identifier: ServiceIdentifier<T>): ServiceId | null {
  return REVERSE_SERVICE_ID_MAP.get(identifier as ServiceIdentifier<unknown>) || null
}
