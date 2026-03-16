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
 * 用于需要依赖其他服务的服务
 *
 * 用法：
 * ```typescript
 * const MyService = createService(class {
 *   constructor(
 *     @inject(IApiService) private api: ApiService,
 *     @inject(ILoggerService) private logger: LoggerService
 *   ) {}
 * })
 * ```
 */
export function createService<T extends new (...args: unknown[]) => unknown>(ServiceClass: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(ServiceClass as any, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    construct(target: any, args: unknown[]) {
      return new target(...args)
    }
  })
}
