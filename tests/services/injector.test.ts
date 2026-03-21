import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AnnotatedInjector,
  Inject,
  Injector,
  createAnnotatedInstance,
  createInstance
} from '@/services/injector'
import { registerService, resetServices } from '@/services/registry'
import { IApiService, IConfigService, ILoggerService } from '@/services/types'
import { LogLevel } from '@/services/loggerService'

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
  get() {
    return {
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
  }

  getPort(_name: string): number {
    return 3000
  }
}

class NoDepService {
  name = 'NoDepService'
}

class UnannotatedService {
  constructor(
    public api: MockApiService,
    public logger: MockLoggerService
  ) {}
}

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

class PartiallyAnnotatedService {
  constructor(
    @Inject(ILoggerService) public logger: MockLoggerService,
    public api: MockApiService
  ) {}
}

class ConfiguredService {
  constructor(
    @Inject(IConfigService) public config: MockConfigService,
    @Inject(ILoggerService) public logger: MockLoggerService
  ) {}
}

describe('Injector', () => {
  beforeEach(() => {
    resetServices()
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
    registerService(IConfigService, () => new MockConfigService())
  })

  it('creates classes without constructor dependencies', () => {
    const injector = new Injector()
    const instance = injector.createInstance(NoDepService)

    expect(instance).toBeInstanceOf(NoDepService)
    expect(instance.name).toBe('NoDepService')
  })

  it('creates classes with explicit @Inject annotations', () => {
    const injector = new Injector()
    const instance = injector.createInstance(AnnotatedService as never) as AnnotatedService

    expect(instance.api).toBeInstanceOf(MockApiService)
    expect(instance.logger).toBeInstanceOf(MockLoggerService)

    instance.fetchData('123')
    expect(instance.logger.info).toHaveBeenCalledWith('AnnotatedService', 'Fetching data 123')
  })

  it('throws when constructor dependencies are not explicitly annotated', () => {
    const injector = new Injector()

    expect(() => injector.createInstance(UnannotatedService as never)).toThrow(
      /Missing @Inject annotation/
    )
  })

  it('throws when only part of the constructor is annotated', () => {
    const injector = new Injector()

    expect(() => injector.createInstance(PartiallyAnnotatedService as never)).toThrow(
      /Missing @Inject annotation/
    )
  })

  it('supports singleton instances for explicitly annotated classes', () => {
    const injector = new Injector()

    const first = injector.createInstance(AnnotatedService as never, {
      singleton: true
    }) as AnnotatedService
    const second = injector.createInstance(AnnotatedService as never, {
      singleton: true
    }) as AnnotatedService

    expect(first).toBe(second)
  })

  it('creates fresh instances when singleton caching is disabled', () => {
    const injector = new Injector()

    const first = injector.createInstance(AnnotatedService as never) as AnnotatedService
    const second = injector.createInstance(AnnotatedService as never) as AnnotatedService

    expect(first).not.toBe(second)
  })
})

describe('AnnotatedInjector', () => {
  beforeEach(() => {
    resetServices()
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
    registerService(IConfigService, () => new MockConfigService())
  })

  it('remains compatible with explicit @Inject annotations', () => {
    const injector = new AnnotatedInjector()
    const instance = injector.createInstance(ConfiguredService as never) as ConfiguredService

    expect(instance.config).toBeInstanceOf(MockConfigService)
    expect(instance.logger).toBeInstanceOf(MockLoggerService)
  })
})

describe('global injector helpers', () => {
  beforeEach(() => {
    resetServices()
    registerService(IApiService, () => new MockApiService())
    registerService(ILoggerService, () => new MockLoggerService())
    registerService(IConfigService, () => new MockConfigService())
  })

  it('createInstance uses the global injector for explicit dependencies', () => {
    const instance = createInstance(AnnotatedService as never) as AnnotatedService

    expect(instance).toBeInstanceOf(AnnotatedService)
    expect(instance.api).toBeInstanceOf(MockApiService)
  })

  it('createAnnotatedInstance uses the global annotated injector', () => {
    const instance = createAnnotatedInstance(ConfiguredService as never) as ConfiguredService

    expect(instance).toBeInstanceOf(ConfiguredService)
    expect(instance.config.getPort('qq')).toBe(3000)
  })
})
