/**
 * 简单依赖注入容器
 * 参考 VSCode 的 IInstantiationService，但保持简洁
 *
 * 功能：
 * 1. 自动解析构造函数依赖
 * 2. 支持单例作用域
 * 3. 支持工厂模式创建实例
 */

// Reflect 元数据支持
import 'reflect-metadata'

import { getService } from './registry'
import type { ServiceId } from './registry'
import type { ServiceIdentifier } from './types'
import { getServiceId } from './types'

// 扩展 Reflect 类型定义
declare module 'reflect-metadata' {
  interface Reflect {
    getMetadata(metadataKey: string, target: object): unknown
    defineMetadata(metadataKey: string, metadataValue: unknown, target: object): void
  }
}

/**
 * 依赖注入选项
 */
export interface InstantiateOptions {
  /**
   * 是否作为单例缓存
   * @default false
   */
  singleton?: boolean
}

/**
 * 依赖注入容器类
 *
 * 用法：
 * ```typescript
 * const injector = new Injector()
 *
 * // 自动解析依赖并创建实例
 * const instance = injector.createInstance(MyClass)
 *
 * // 或者使用单例模式
 * const service = injector.createInstance(MyService, { singleton: true })
 * ```
 */
export class Injector {
  private singletons = new Map<new (...args: unknown[]) => unknown, unknown>()

  /**
   * 创建实例，自动解析构造函数依赖
   *
   * @param target - 要实例化的类
   * @param options - 选项
   * @returns 实例
   *
   * @example
   * ```typescript
   * class MyService {
   *   constructor(
   *     private api = getService('api'),
   *     private logger = getService('logger')
   *   ) {}
   * }
   *
   * const injector = new Injector()
   * const service = injector.createInstance(MyService)
   * ```
   */
  createInstance<T extends object>(
    target: new (...args: unknown[]) => T,
    options: InstantiateOptions = {}
  ): T {
    // 检查是否是单例
    if (options.singleton) {
      const cached = this.singletons.get(target)
      if (cached) {
        return cached as T
      }
    }

    // 获取构造函数参数
    const params = this.resolveDependencies(target)

    // 创建实例
    const instance = new target(...params)

    // 缓存单例
    if (options.singleton) {
      this.singletons.set(target, instance)
    }

    return instance
  }

  /**
   * 解析构造函数的依赖
   * 目前支持两种模式：
   * 1. 使用 getService() 获取服务
   * 2. 使用默认参数值
   */
  protected resolveDependencies(target: new (...args: unknown[]) => unknown): unknown[] {
    // 读取构造函数的参数数量
    const paramCount = target.length

    if (paramCount === 0) {
      return []
    }

    // 对于有参数的构造函数，尝试从 getService 获取依赖
    // 注意：这需要构造函数参数有默认值或使用 @inject 装饰器
    const params: unknown[] = []

    for (let i = 0; i < paramCount; i++) {
      // 尝试通过 getService 获取服务
      // 这里使用一个简单的策略：按顺序获取已知服务
      // 在实际使用中，推荐使用装饰器明确指定依赖
      params.push(this.getServiceByIndex(i))
    }

    return params
  }

  /**
   * 按索引获取服务（用于依赖解析）
   * 这是一个简单的映射，按常见参数顺序返回服务
   */
  protected getServiceByIndex(index: number): unknown {
    // 常见服务顺序：platform, api, logger, error, config, command
    const serviceOrder: ServiceId[] = ['platform', 'api', 'logger', 'error', 'config', 'context', 'command']

    if (index < serviceOrder.length) {
      try {
        return getService(serviceOrder[index])
      } catch {
        return undefined
      }
    }

    return undefined
  }

  /**
   * 清理单例缓存
   */
  dispose(): void {
    this.singletons.clear()
  }
}

/**
 * 全局注入器实例
 */
const globalInjector = new Injector()

/**
 * 获取全局注入器
 */
export function getInjector(): Injector {
  return globalInjector
}

/**
 * 创建实例的便捷函数
 *
 * @param target - 要实例化的类
 * @param options - 选项
 * @returns 实例
 */
export function createInstance<T extends object>(
  target: new (...args: unknown[]) => T,
  options?: InstantiateOptions
): T {
  return globalInjector.createInstance(target, options)
}

// ==================== 带类型注解的依赖注入 ====================

/**
 * 依赖注解 - 用于标记构造函数参数的类型
 *
 * 用法：
 * ```typescript
 * class MyService {
 *   constructor(
 *     @Inject(IApiService) private api: ApiService,
 *     @Inject(ILoggerService) private logger: LoggerService
 *   ) {}
 * }
 * ```
 */
export function Inject<T>(identifier: ServiceIdentifier<T> | ServiceId): ParameterDecorator {
  return function (
    target: object,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) {
    // 获取或创建参数注解元数据
    const metadataKey = Symbol.for(`inject:${target}`)
    const existingMetadata =
      (
        Reflect as typeof Reflect & { getMetadata: (key: symbol, target: object) => unknown[] }
      ).getMetadata(metadataKey, target) || []

    // 保存注解信息 - 支持字符串或服务标识符对象
    let serviceId: ServiceId
    if (typeof identifier === 'string') {
      serviceId = identifier
    } else {
      // 从 ServiceIdentifier 获取短名称
      const shortId = getServiceId(identifier)
      if (!shortId) {
        console.error(`[Inject] Unknown ServiceIdentifier: ${identifier.name}`)
        serviceId = 'api' as ServiceId // Fallback
      } else {
        serviceId = shortId
      }
    }

    existingMetadata[parameterIndex] = serviceId
    ;(
      Reflect as typeof Reflect & {
        defineMetadata: (key: symbol, value: unknown[], target: object) => void
      }
    ).defineMetadata(metadataKey, existingMetadata, target)
  }
}

/**
 * 使用注解解析依赖的注入器
 *
 * 用法：
 * ```typescript
 * class MyService {
 *   constructor(
 *     @Inject('api') private api: ApiService,
 *     @Inject('logger') private logger: LoggerService
 *   ) {}
 * }
 *
 * const injector = new AnnotatedInjector()
 * const service = injector.createInstance(MyService)
 * ```
 */
export class AnnotatedInjector extends Injector {
  private metadataCache = new Map<new (...args: unknown[]) => unknown, ServiceId[]>()

  /**
   * 重写依赖解析，支持 @Inject 注解
   */
  protected resolveDependencies(target: new (...args: unknown[]) => unknown): unknown[] {
    const annotations = this.getAnnotations(target)
    const params: unknown[] = []

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i]
      if (annotation) {
        try {
          params.push(getService(annotation))
        } catch (error) {
          console.error(`[Injector] Failed to resolve dependency ${annotation}:`, error)
          params.push(undefined)
        }
      } else {
        params.push(this.getServiceByIndex(i))
      }
    }

    return params
  }

  protected getAnnotations(target: new (...args: unknown[]) => unknown): ServiceId[] {
    const cached = this.metadataCache.get(target)
    if (cached) {
      return cached
    }

    // 尝试读取 Reflect 元数据
    const metadataKey = Symbol.for(`inject:${target}`)
    const metadata = Reflect.getMetadata(metadataKey, target)

    if (metadata && Array.isArray(metadata)) {
      this.metadataCache.set(target, metadata)
      return metadata
    }

    return []
  }
}

/**
 * 全局注解注入器实例
 */
const globalAnnotatedInjector = new AnnotatedInjector()

/**
 * 获取全局注解注入器
 */
export function getAnnotatedInjector(): AnnotatedInjector {
  return globalAnnotatedInjector
}

/**
 * 创建带注解实例的便捷函数
 */
export function createAnnotatedInstance<T extends object>(
  target: new (...args: unknown[]) => T,
  options?: InstantiateOptions
): T {
  return globalAnnotatedInjector.createInstance(target, options)
}
