/**
 * 依赖注入使用示例
 *
 * 本项目提供了三种依赖注入方式：
 * 1. 直接 getService() - 最简单，适合快速开发
 * 2. @inject 装饰器 - 适合类组件
 * 3. Injector 自动注入 - 最灵活，适合复杂场景
 */

import { getService } from './registry'
import { inject /* , useService */ } from './decorators'
import { Injector, Inject, createInstance, createAnnotatedInstance } from './injector'

// ==================== 方式 1: 直接 getService ====================
// 最简单直接，适合快速开发

export class SimpleService {
  private api = getService('api')
  private logger = getService('logger')

  fetchData(id: string): void {
    this.logger.info('SimpleService', `Fetching data for ${id}`)
    this.api.request('netease', '/song/detail', { ids: id })
  }
}

const _simpleExample = new SimpleService()

// ==================== 方式 2: 使用装饰器 @inject ====================
// 适合 Vue 组件和需要明确依赖的类

export class DecoratedService {
  @inject(IApiService) private api!: import('./apiService').ApiService
  @inject(ILoggerService) private logger!: import('./loggerService').LoggerService

  fetchData(id: string): void {
    this.logger.info('DecoratedService', `Fetching data for ${id}`)
    this.api.request('netease', '/song/detail', { ids: id })
  }
}

const _decoratedExample = new DecoratedService()

// Vue 组件示例
/*
import { defineComponent } from 'vue'

export default defineComponent({
  setup() {
    const api = useService(IApiService)
    const logger = useService(ILoggerService)

    const fetchData = (id: string) => {
      logger.info('Component', `Fetching ${id}`)
      return api.request('netease', '/song/detail', { ids: id })
    }

    return { fetchData }
  }
})
*/

// ==================== 方式 3: Injector 自动注入 ====================
// 最灵活，支持构造函数注入和单例模式

/**
 * 使用构造函数的类
 * 参数默认值使用 getService() 获取服务
 */
export class PlayerService {
  constructor(
    private api = getService('api'),
    private logger = getService('logger')
  ) {}

  playSong(songId: string): void {
    this.logger.info('PlayerService', `Playing song ${songId}`)
    this.api.request('netease', '/song/url/v1', { id: songId })
  }
}

const _playerExample = new PlayerService()

/**
 * 使用 @Inject 注解的类
 * 类型更安全，依赖关系更明确
 */
export class AnnotatedPlayerService {
  constructor(
    @Inject(IApiService) private api: import('./apiService').ApiService,
    @Inject(ILoggerService) private logger: import('./loggerService').LoggerService
  ) {}

  playSong(songId: string): void {
    this.logger.info('AnnotatedPlayerService', `Playing song ${songId}`)
    this.api.request('netease', '/song/url/v1', { id: songId })
  }
}

// ==================== 使用示例 ====================

export function demonstrateDI(): void {
  // 方式 1: 直接实例化（依赖在内部获取）
  const simple = new SimpleService()
  simple.fetchData('123')

  // 方式 2: 装饰器方式（需要 TypeScript 启用 experimentalDecorators）
  const decorated = new DecoratedService()
  decorated.fetchData('456')

  // 方式 3a: 使用 Injector 自动解析
  const injector = new Injector()
  const player1 = injector.createInstance(PlayerService)
  player1.playSong('789')

  // 方式 3b: 使用 Injector + 单例模式
  const player2 = injector.createInstance(PlayerService, { singleton: true })
  const player3 = injector.createInstance(PlayerService, { singleton: true })
  console.log(player2 === player3) // true，同一个实例

  // 方式 3c: 使用 AnnotatedInjector + @Inject 注解
  const annotatedPlayer = createAnnotatedInstance(AnnotatedPlayerService)
  annotatedPlayer.playSong('012')

  // 便捷函数方式
  const player4 = createInstance(PlayerService)
  player4.playSong('345')
}

// ==================== 高级用法：服务依赖其他服务 ====================

/**
 * 下载服务依赖 API 服务和日志服务
 */
export class DownloadService {
  constructor(
    @Inject(IApiService) private api: import('./apiService').ApiService,
    @Inject(ILoggerService) private logger: import('./loggerService').LoggerService
  ) {}

  async downloadSong(songId: string): Promise<string> {
    this.logger.info('DownloadService', `Downloading song ${songId}`)

    const response = await this.api.request('netease', '/song/url/v1', {
      id: songId,
      level: 'standard'
    })

    return response.data?.url || ''
  }
}

/**
 * 缓存服务依赖日志服务
 */
export class CacheService {
  constructor(
    @Inject(ILoggerService) private logger: import('./loggerService').LoggerService
  ) {}

  get(key: string): string | null {
    this.logger.debug('CacheService', `Getting cache key: ${key}`)
    return localStorage.getItem(key)
  }

  set(key: string, value: string): void {
    this.logger.debug('CacheService', `Setting cache key: ${key}`)
    localStorage.setItem(key, value)
  }
}

/**
 * 复杂场景：多层依赖
 * DownloadManager 依赖 DownloadService 和 CacheService
 */
export class DownloadManager {
  constructor(
    @Inject(ILoggerService) private logger: import('./loggerService').LoggerService,
    private downloadService: DownloadService = createAnnotatedInstance(DownloadService),
    private cacheService: CacheService = createAnnotatedInstance(CacheService)
  ) {}

  async downloadWithCache(songId: string): Promise<string> {
    // 先尝试从缓存获取
    const cached = this.cacheService.get(`song:${songId}`)
    if (cached) {
      this.logger.info('DownloadManager', `Cache hit for ${songId}`)
      return cached
    }

    // 缓存未命中，下载并缓存
    this.logger.info('DownloadManager', `Cache miss for ${songId}, downloading...`)
    const url = await this.downloadService.downloadSong(songId)
    this.cacheService.set(`song:${songId}`, url)

    return url
  }
}

// ==================== 测试用例：Mock 依赖 ====================

/**
 * Mock API 服务用于测试
 */
export class MockApiService {
  request(service: string, endpoint: string, params?: Record<string, unknown>): Promise<unknown> {
    console.log(`[MockAPI] ${service}${endpoint}`, params)
    return Promise.resolve({ data: { url: 'mock-url' } })
  }
}

/**
 * Mock 日志服务用于测试
 */
export class MockLoggerService {
  info(module: string, message: string): void {
    console.log(`[MockLogger][${module}] ${message}`)
  }
  warn(module: string, message: string): void {
    console.warn(`[MockLogger][${module}] ${message}`)
  }
  error(module: string, message: string): void {
    console.error(`[MockLogger][${module}] ${message}`)
  }
  debug(module: string, message: string): void {
    console.debug(`[MockLogger][${module}] ${message}`)
  }
}

// ==================== 总结 ====================

/**
 * 依赖注入方式选择建议：
 *
 * 1. **快速开发/小项目**: 直接 getService()
 *    - 优点：简单直接，代码量少
 *    - 缺点：依赖关系不明显，测试时需要手动 Mock
 *
 * 2. **Vue 组件/中等项目**: @inject 装饰器 + useService()
 *    - 优点：依赖关系清晰，易于测试
 *    - 缺点：需要 TypeScript 启用 experimentalDecorators
 *
 * 3. **复杂服务/大型项目**: Injector + 构造函数注入
 *    - 优点：依赖完全显式，支持单例/瞬态作用域，易于测试和维护
 *    - 缺点：代码量稍多，需要理解 DI 概念
 *
 * 推荐：新代码优先使用 Injector + 构造函数注入方式
 */
