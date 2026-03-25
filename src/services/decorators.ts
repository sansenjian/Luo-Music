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
 * 属性注入装饰器 - 懒加载方式注入服务到类属性
 *
 * 用法：
 * ```typescript
 * class MyComponent {
 *   @inject(IApiService) private api!: ApiService
 *
 *   fetchData() {
 *     return this.api.request('/endpoint')
 *   }
 * }
 * ```
 *
 * 特点：
 * - 属性访问时懒加载获取服务实例
 * - 不需要构造函数注解
 * - 适用于 Vue 组件、简单类等场景
 *
 * 注意：
 * - 需要 tsconfig.json 启用 experimentalDecorators
 * - 构造函数注入请使用 injector.ts 中的 `@injectParam()`
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
 *
 * 说明：
 * - 此函数用于创建服务类实例，保留服务类声明的统一入口
 * - **属性注入**请使用 `@inject(...)` 装饰器（来自 decorators.ts）
 * - **构造函数参数注入**请使用 `@injectParam(...)` 装饰器（来自 injector.ts）
 *
 * 用法示例：
 * ```typescript
 * // 属性注入方式
 * const MyService = createService(class {
 *   @inject(IApiService) private api!: ApiService
 * })
 *
 * // 构造函数参数注入方式（推荐用于复杂依赖）
 * const MyService = createService(class {
 *   constructor(@injectParam(IApiService) private api: ApiService) {}
 * })
 * ```
 */
export function createService<TArgs extends unknown[], TInstance>(
  ServiceClass: new (...args: TArgs) => TInstance
): new (...args: TArgs) => TInstance {
  // 直接返回原类，Proxy 保留用于未来扩展
  return ServiceClass
}
