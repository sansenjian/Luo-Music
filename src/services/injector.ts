import { getService } from './registry'
import type { ServiceIdentifier, ServiceId } from './types'
import { SERVICE_ID_MAP } from './types'

export interface InstantiateOptions {
  singleton?: boolean
}

type Constructor<T extends object> = new (...args: unknown[]) => T

const injectionMetadata = new WeakMap<object, Map<number, ServiceIdentifier<unknown>>>()

function normalizeIdentifier<T>(
  identifier: ServiceIdentifier<T> | ServiceId
): ServiceIdentifier<T> {
  if (typeof identifier === 'string') {
    const normalized = SERVICE_ID_MAP[identifier]
    if (!normalized) {
      throw new Error(`[Inject] Unknown service ID: "${identifier}"`)
    }

    return normalized as ServiceIdentifier<T>
  }

  return identifier
}

function getMetadataTarget(target: object): object {
  return typeof target === 'function'
    ? target
    : ((target as { constructor?: object }).constructor ?? target)
}

function getDependencyIdentifiers(
  target: Constructor<object>
): Array<ServiceIdentifier<unknown> | undefined> {
  const metadata = injectionMetadata.get(target)
  if (!metadata || metadata.size === 0) {
    return []
  }

  const parameterCount = target.length
  return Array.from({ length: parameterCount }, (_, index) => metadata.get(index))
}

function missingDependencyError(target: Constructor<object>, parameterIndex: number): Error {
  const className = target.name || 'AnonymousClass'

  return new Error(
    `[Injector] Missing @inject annotation for ${className} constructor parameter #${parameterIndex}. ` +
      'Constructor injection is explicit-only. Annotate each dependency or use services.xxx() directly.'
  )
}

export class Injector {
  private readonly singletons = new Map<Constructor<object>, object>()

  createInstance<T extends object>(target: Constructor<T>, options: InstantiateOptions = {}): T {
    if (options.singleton) {
      const cached = this.singletons.get(target as Constructor<object>)
      if (cached) {
        return cached as T
      }
    }

    const params = this.resolveDependencies(target)
    const instance = new target(...params)

    if (options.singleton) {
      this.singletons.set(target as Constructor<object>, instance)
    }

    return instance
  }

  protected resolveDependencies(target: Constructor<object>): unknown[] {
    const parameterCount = target.length

    if (parameterCount === 0) {
      return []
    }

    const dependencyIdentifiers = getDependencyIdentifiers(target)
    if (dependencyIdentifiers.length === 0) {
      throw missingDependencyError(target, 0)
    }

    return dependencyIdentifiers.map((identifier, parameterIndex) => {
      if (!identifier) {
        throw missingDependencyError(target, parameterIndex)
      }

      try {
        return getService(identifier)
      } catch (error) {
        const className = target.name || 'AnonymousClass'
        throw new Error(
          `[Injector] Failed to resolve ${identifier.name} for ${className} constructor parameter #${parameterIndex}: ${String(error)}`,
          { cause: error }
        )
      }
    })
  }

  dispose(): void {
    this.singletons.clear()
  }
}

const globalInjector = new Injector()

export function getInjector(): Injector {
  return globalInjector
}

export function createInstance<T extends object>(
  target: Constructor<T>,
  options?: InstantiateOptions
): T {
  return globalInjector.createInstance(target, options)
}

/**
 * 构造函数参数注入装饰器 - 用于依赖注入容器解析依赖
 *
 * 用法：
 * ```typescript
 * class MyService {
 *   constructor(@injectParam(IApiService) private api: ApiService) {}
 * }
 * const instance = getInjector().createInstance(MyService)
 * ```
 *
 * 注意：此装饰器仅与 Injector.createInstance() 配合使用
 * 属性注入请使用 decorators.ts 中的 `@inject()`
 */
export function injectParam<T>(identifier: ServiceIdentifier<T> | ServiceId): ParameterDecorator {
  return function (
    target: object,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) {
    const metadataTarget = getMetadataTarget(target)
    const metadata =
      injectionMetadata.get(metadataTarget) ?? new Map<number, ServiceIdentifier<unknown>>()

    metadata.set(parameterIndex, normalizeIdentifier(identifier))
    injectionMetadata.set(metadataTarget, metadata)
  }
}

/**
 * @deprecated 请使用 `injectParam` 代替
 * 保留此别名以向后兼容，但建议迁移到 injectParam 以明确区分参数注入和属性注入
 */
export const inject = injectParam

export class AnnotatedInjector extends Injector {}

const globalAnnotatedInjector = new AnnotatedInjector()

export function getAnnotatedInjector(): AnnotatedInjector {
  return globalAnnotatedInjector
}

export function createAnnotatedInstance<T extends object>(
  target: Constructor<T>,
  options?: InstantiateOptions
): T {
  return globalAnnotatedInjector.createInstance(target, options)
}
