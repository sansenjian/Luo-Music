/**
 * DI 与服务层使用示例
 *
 * 这份示例只展示当前仓库推荐的三种用法：
 * 1. 默认使用 `services.xxx()`
 * 2. 热点模块使用显式 `deps`
 * 3. 基础设施类在确有需要时使用 `@injectParam(...)`
 *
 * 注意：
 * - 这不是“所有业务代码都应该这样写”的模板合集
 * - 示例以当前仓库已落地的规则为准，而不是展示理论上更多的 DI 玩法
 */

import { services } from '@/services'
import type { ApiService } from '@/services/apiService'
import type { LoggerService } from '@/services/loggerService'
import { createInstance, injectParam } from '@/services/injector'
import { IApiService, ILoggerService } from '@/services/types'

// ==================== 方式 1：默认使用 services.xxx() ====================

/**
 * 适用于普通业务模块。
 * 默认路径简单、稳定，也和当前服务 override 机制兼容。
 */
export class DefaultServiceUsageExample {
  private readonly logger = services.logger().createLogger('default-example')

  async loadSong(id: string): Promise<unknown> {
    this.logger.info('Loading song', { id })
    return services.api().request('netease', '/song/detail', { ids: id })
  }
}

export function createDefaultServiceUsageExample(): DefaultServiceUsageExample {
  return new DefaultServiceUsageExample()
}

// ==================== 方式 2：热点模块使用显式 deps ====================

type SearchFacadeDeps = {
  getApiService?: () => Pick<ApiService, 'request'>
  getLogger?: () => Pick<LoggerService, 'debug'>
}

const defaultSearchFacadeDeps: Required<SearchFacadeDeps> = {
  getApiService: () => services.api(),
  getLogger: () => services.logger().createLogger('search-facade')
}

/**
 * 适用于复杂 store / composable / 高副作用模块。
 * 默认实现仍来自 services，但测试可以传最小替身。
 */
export class SearchFacade {
  constructor(private readonly deps: Required<SearchFacadeDeps> = defaultSearchFacadeDeps) {}

  async search(keyword: string): Promise<unknown> {
    this.deps.getLogger().debug('Search requested', { keyword })
    return this.deps.getApiService().request('netease', '/cloudsearch', {
      keywords: keyword,
      type: 1,
      limit: 30,
      offset: 0
    })
  }
}

export function createSearchFacade(deps: SearchFacadeDeps = {}): SearchFacade {
  return new SearchFacade({ ...defaultSearchFacadeDeps, ...deps })
}

export function createSearchFacadeForTest() {
  const request = async (_service: string, _endpoint: string, params?: Record<string, unknown>) => {
    return {
      mocked: true,
      params
    }
  }

  return createSearchFacade({
    getApiService: () => ({
      request
    }),
    getLogger: () => ({
      debug: () => {}
    })
  })
}

// ==================== 方式 3：基础设施类使用 @injectParam(...) ====================

/**
 * 仅在“这个类值得通过 Injector 创建”时使用。
 * 不推荐把这种方式扩散到普通 Vue 业务代码。
 */
export class DownloadJob {
  constructor(
    @injectParam(IApiService) private readonly api: ApiService,
    @injectParam(ILoggerService) private readonly logger: LoggerService
  ) {}

  async run(songId: string): Promise<unknown> {
    this.logger.info('Download job started', { songId })
    return this.api.request('netease', '/song/url/v1', {
      id: songId,
      level: 'standard'
    })
  }
}

export function createDownloadJob(): DownloadJob {
  return createInstance(DownloadJob)
}

// ==================== 选择建议 ====================

/**
 * 结论：
 *
 * 1. 普通业务代码：优先 `services.xxx()`
 * 2. 热点模块、测试敏感模块：增加显式 `deps`
 * 3. 基础设施类：确有实例化需求时再用 `@injectParam(...)`
 *
 * 不推荐：
 * - 继续新增 accessor 兼容入口
 * - 在模块顶层缓存服务实例
 * - 为了“更像 DI”把普通组件/页面强行改成构造注入
 */
export function summarizeCurrentDiGuidance(): string[] {
  return [
    '业务代码默认使用 services.xxx()',
    '热点模块通过显式 deps 降低测试替身成本',
    'injectParam 只用于真正需要 Injector 的基础设施类'
  ]
}
