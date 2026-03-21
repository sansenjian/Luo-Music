/**
 * 装饰器和工具函数 - 用于依赖注入
 * 参考 VSCode 的 decorator 实现
 */

import { getService } from './registry'
import type { ServiceIdentifier } from './types'

// 重新导出 types.ts 中定义的标识符
export {
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
  createDecorator,
  type ServiceIdentifier
} from './types'

/**
 * 注入服务到类属性
 * 用法：
 * ```typescript
 * class MyComponent {
 *   @inject(IApiService) private api!: ApiService
 * }
 * ```
 *
 * 注意：需要 tsconfig.json 启用 experimentalDecorators
 */
export function inject<T>(identifier: ServiceIdentifier<T>): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    Object.defineProperty(target, propertyKey, {
      get() {
        return getService<T>(identifier)
      },
      enumerable: true,
      configurable: true
    })
  }
}

/**
 * 函数式注入 - 不依赖装饰器
 * 用于在不支持装饰器的环境中使用
 *
 * 用法：
 * ```typescript
 * const api = useService(IApiService)
 * ```
 */
export function useService<T>(identifier: ServiceIdentifier<T>): T {
  return getService<T>(identifier)
}

/**
 * 创建带依赖注入的服务类
 * 用于保留服务类声明的统一入口。
 * 构造函数依赖请使用 `@Inject(...)` 参数装饰器，而不是 `@inject(...)`。
 *
 * 用法：
 * ```typescript
 * const MyService = createService(class {
 *   @inject(IApiService) private api!: ApiService
 * })
 * ```
 */
export function createService<TArgs extends unknown[], TInstance>(
  ServiceClass: new (...args: TArgs) => TInstance
): new (...args: TArgs) => TInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(ServiceClass as any, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    construct(target: any, args: unknown[]) {
      return new target(...args)
    }
  })
}
