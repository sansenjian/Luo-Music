import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  Injector,
  AnnotatedInjector,
  Inject,
  createInstance,
  createAnnotatedInstance
} from '@/services/injector'
import { getService, registerService, resetServices } from '@/services/registry'
import { IApiService, ILoggerService, IConfigService } from '@/services/types'
import { LogLevel } from '@/services/loggerService'

// ==================== Mock 服务定义 ====================

class MockLoggerService {
  resource = 'test'
  onDidChangeLogLevel = vi.fn()
  trace = vi.fn()
  info = vi.fn()
  warn = vi.fn()
  error = vi.fn()
  debug = vi.fn()
  setLevel = vi.fn()
  getLevel = vi.fn(() => LogLevel.Info)
  flush = vi.fn()
  dispose = vi.fn()
  createLogger = vi.fn(() => this)
  getLogger = vi.fn(() => this)
  hasLogger = vi.fn(() => true)
}

class MockApiService {
  request = vi.fn().mockResolvedValue({ data: { url: 'mock-url' } })
}

class MockConfigService {
  private config = {
    env: {
      mode: 'test',
      isDev: true,
      isProd: false
    },
    ports: {
      qq: 3200,
      netease: 14532
    }
  }

  get() {
    return this.config
  }

  getPort(name: string): number {
    return 3000
  }
}

// ==================== 测试类定义 ====================

/**
 * 无依赖的类
 */
class NoDepService {
  name = 'NoDepService'
}

/**
 * 使用默认参数获取依赖的类
 */
class PlayerService {
  constructor(
    public api?: MockApiService,
    public logger?: MockLoggerService
  ) {
    // 如果未传入依赖，使用 getService 懒加载
    if (!api) {
      this.api = getService(IApiService) as MockApiService
    }
    if (!logger) {
      this.logger = getService(ILoggerService) as MockLoggerService
    }
  }

  playSong(songId: string): string {
    this.logger!.info('PlayerService', `Playing song ${songId}`)
    return `playing-${songId}`
  }
}

/**
 * 使用 @Inject 注解的类
 */
class AnnotatedService {
  constructor(
    @Inject(IApiService) public api: MockApiService,
    @Inject(ILoggerService) public logger: MockLoggerService
  ) {}

  fetchData(id: string): string {
    this.logger.info('AnnotatedService', `Fetching data ${id}`)
    return `data-${id}`
  }
}

/**
 * 多层依赖的类
 */
class DownloadService {
  constructor(
    @Inject(IApiService) public api: MockApiService,
    @Inject(ILoggerService) public logger: MockLoggerService
  ) {}

  async download(songId: string): Promise<string> {
    this.logger.info('DownloadService', `Downloading ${songId}`)
    const result = await this.api.request('netease', '/song/url', { id: songId })
    return result.data?.url || ''
  }
}

class DownloadManager {
  constructor(
    @Inject(ILoggerService) public logger: MockLoggerService,
    public downloadService: DownloadService
  ) {}

  async downloadWithLog(songId: string): Promise<string> {
    this.logger.info('DownloadManager', 'Starting download')
    return this.downloadService.download(songId)
  }
}

// ==================== 测试用例 ====================

describe('Injector', () => {
  beforeEach(() => {
    resetServices()

    // 注册 Mock 服务
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
    registerService(IConfigService, () => new MockConfigService())
  })

  describe('createInstance', () => {
    it('should create instance with no dependencies', () => {
      const injector = new Injector()
      const instance = injector.createInstance(NoDepService)

      expect(instance).toBeInstanceOf(NoDepService)
      expect(instance.name).toBe('NoDepService')
    })

    it('should create instance with default parameter dependencies', () => {
      const injector = new Injector()
      const instance = injector.createInstance(PlayerService as any) as PlayerService

      expect(instance).toBeInstanceOf(PlayerService)
      expect(instance.api).toBeDefined()
      expect(instance.logger).toBeDefined()
    })

    it('should inject real services when using @Inject annotations', () => {
      const injector = new AnnotatedInjector()
      const instance = injector.createInstance(AnnotatedService as any) as AnnotatedService

      instance.fetchData('123')

      expect(instance.api.request).toBeDefined()
      expect(instance.logger.info).toHaveBeenCalled()
    })

    it('should create singleton instance when option is set', () => {
      const injector = new Injector()

      const instance1 = injector.createInstance(PlayerService as any, {
        singleton: true
      }) as PlayerService
      const instance2 = injector.createInstance(PlayerService as any, {
        singleton: true
      }) as PlayerService

      expect(instance1).toBe(instance2)
    })

    it('should create different instances when singleton is false', () => {
      const injector = new Injector()

      const instance1 = injector.createInstance(PlayerService as any) as PlayerService
      const instance2 = injector.createInstance(PlayerService as any) as PlayerService

      expect(instance1).not.toBe(instance2)
    })
  })

  describe('createAnnotatedInstance', () => {
    it('should create instance with @Inject annotations', () => {
      const instance = createAnnotatedInstance(AnnotatedService as any) as AnnotatedService

      expect(instance).toBeInstanceOf(AnnotatedService)
      expect(instance.api).toBeDefined()
      expect(instance.logger).toBeDefined()
    })

    it('should use mocked services from registry', () => {
      const instance = createAnnotatedInstance(AnnotatedService as any) as AnnotatedService

      instance.fetchData('456')

      expect(instance.logger.info).toHaveBeenCalled()
    })
  })

  describe('nested dependencies', () => {
    it('should resolve nested dependencies', async () => {
      const injector = new Injector()

      // 手动创建依赖
      const downloadService = createAnnotatedInstance(DownloadService as any) as DownloadService
      const downloadManager = new DownloadManager(
        getService(ILoggerService) as MockLoggerService,
        downloadService
      )

      const url = await downloadManager.downloadWithLog('789')

      expect(url).toBe('mock-url')
      expect(downloadManager.logger.info).toHaveBeenCalled()
    })
  })
})

describe('AnnotatedInjector', () => {
  beforeEach(() => {
    resetServices()
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
  })

  it('should resolve dependencies using @Inject annotations', () => {
    const injector = new AnnotatedInjector()
    const instance = injector.createInstance(AnnotatedService as any) as AnnotatedService

    expect(instance.api).toBeInstanceOf(MockApiService)
    expect(instance.logger).toBeInstanceOf(MockLoggerService)
  })

  it('should call methods on injected services', () => {
    const injector = new AnnotatedInjector()
    const instance = injector.createInstance(AnnotatedService as any) as AnnotatedService

    instance.fetchData('test')

    expect(instance.logger.info).toHaveBeenCalledWith('AnnotatedService', 'Fetching data test')
  })
})

describe('global injector functions', () => {
  beforeEach(() => {
    resetServices()
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
  })

  it('createInstance should use global injector', () => {
    const instance = createInstance(PlayerService as any) as PlayerService

    expect(instance).toBeInstanceOf(PlayerService)
    expect(instance.api).toBeDefined()
    expect(instance.logger).toBeDefined()
  })

  it('createAnnotatedInstance should use global annotated injector', () => {
    const instance = createAnnotatedInstance(AnnotatedService as any) as AnnotatedService

    expect(instance).toBeInstanceOf(AnnotatedService)
  })
})
