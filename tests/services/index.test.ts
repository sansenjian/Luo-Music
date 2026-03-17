import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerServiceMock = vi.hoisted(() => vi.fn())
const getServiceMock = vi.hoisted(() => vi.fn())
const resetServicesMock = vi.hoisted(() => vi.fn())

const createPlatformServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'platform' })))
const createApiServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'api' })))
const createLoggerServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'logger' })))
const createErrorServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'error' })))
const createConfigServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'config' })))
const createContextKeyServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'context' })))
const createCommandServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'command' })))

const ids = vi.hoisted(() => ({
  IPlatformService: Symbol('platform'),
  IApiService: Symbol('api'),
  ILoggerService: Symbol('logger'),
  IErrorService: Symbol('error'),
  IConfigService: Symbol('config'),
  IContextKeyService: Symbol('context'),
  ICommandService: Symbol('command'),
  createDecorator: vi.fn()
}))

vi.mock('@/services/registry', () => ({
  getService: getServiceMock,
  registerService: registerServiceMock,
  resetServices: resetServicesMock
}))

vi.mock('@/services/platformService', () => ({
  createPlatformService: createPlatformServiceMock
}))

vi.mock('@/services/apiService', () => ({
  createApiService: createApiServiceMock
}))

vi.mock('@/services/loggerService', () => ({
  createLoggerService: createLoggerServiceMock
}))

vi.mock('@/services/errorService', () => ({
  createErrorService: createErrorServiceMock
}))

vi.mock('@/services/configService', () => ({
  createConfigService: createConfigServiceMock
}))

vi.mock('@/services/contextKeyService', () => ({
  createContextKeyService: createContextKeyServiceMock
}))

vi.mock('@/services/commandService', () => ({
  createCommandService: createCommandServiceMock
}))

vi.mock('@/services/types', () => ids)

describe('services index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers default services once with the typed identifiers api', async () => {
    vi.resetModules()
    const module = await import('@/services')

    module.setupServices()
    module.setupServices()

    expect(registerServiceMock).toHaveBeenCalledTimes(7)
    expect(registerServiceMock).toHaveBeenCalledWith(
      ids.IPlatformService,
      createPlatformServiceMock
    )
    expect(registerServiceMock).toHaveBeenCalledWith(ids.IApiService, createApiServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith(ids.ILoggerService, createLoggerServiceMock)
  })

  it('supports overrides and legacy string registrations', async () => {
    vi.resetModules()
    const module = await import('@/services')
    const platformOverride = { kind: 'override-platform' }
    const commandOverride = { kind: 'override-command' }

    module.setupServices(
      {
        platform: platformOverride as never,
        command: commandOverride as never
      },
      false
    )

    expect(resetServicesMock).toHaveBeenCalled()
    expect(registerServiceMock).toHaveBeenCalledWith('platform', createPlatformServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith('command', createCommandServiceMock)

    const platformOverrideCall = registerServiceMock.mock.calls.find(
      ([id, factory]) => id === 'platform' && factory !== createPlatformServiceMock
    )
    const commandOverrideCall = registerServiceMock.mock.calls.find(
      ([id, factory]) => id === 'command' && factory !== createCommandServiceMock
    )

    expect(platformOverrideCall?.[1]()).toBe(platformOverride)
    expect(commandOverrideCall?.[1]()).toBe(commandOverride)
  })

  it('applies typed overrides for all service identifiers', async () => {
    vi.resetModules()
    const module = await import('@/services')
    const overrides = {
      platform: { kind: 'override-platform' },
      api: { kind: 'override-api' },
      logger: { kind: 'override-logger' },
      error: { kind: 'override-error' },
      config: { kind: 'override-config' },
      context: { kind: 'override-context' },
      command: { kind: 'override-command' }
    }

    module.setupServices(overrides as never)

    expect(resetServicesMock).toHaveBeenCalled()

    const findOverrideFactory = (identifier: unknown, defaultFactory: unknown) =>
      registerServiceMock.mock.calls.find(
        ([id, factory]) => id === identifier && factory !== defaultFactory
      )?.[1]

    expect(findOverrideFactory(ids.IPlatformService, createPlatformServiceMock)?.()).toBe(
      overrides.platform
    )
    expect(findOverrideFactory(ids.IApiService, createApiServiceMock)?.()).toBe(overrides.api)
    expect(findOverrideFactory(ids.ILoggerService, createLoggerServiceMock)?.()).toBe(
      overrides.logger
    )
    expect(findOverrideFactory(ids.IErrorService, createErrorServiceMock)?.()).toBe(
      overrides.error
    )
    expect(findOverrideFactory(ids.IConfigService, createConfigServiceMock)?.()).toBe(
      overrides.config
    )
    expect(findOverrideFactory(ids.IContextKeyService, createContextKeyServiceMock)?.()).toBe(
      overrides.context
    )
    expect(findOverrideFactory(ids.ICommandService, createCommandServiceMock)?.()).toBe(
      overrides.command
    )
  })

  it('resolves helper accessors through getService', async () => {
    vi.resetModules()
    getServiceMock.mockImplementation((identifier: unknown) => ({ identifier }))
    const module = await import('@/services')

    expect(module.services.platform()).toEqual({ identifier: ids.IPlatformService })
    expect(module.services.api()).toEqual({ identifier: ids.IApiService })
    expect(module.services.error()).toEqual({ identifier: ids.IErrorService })
    expect(module.services.config()).toEqual({ identifier: ids.IConfigService })
    expect(module.services.context()).toEqual({ identifier: ids.IContextKeyService })
    expect(module.services.logger()).toEqual({ identifier: ids.ILoggerService })
    expect(module.services.commands()).toEqual({ identifier: ids.ICommandService })
  })
})
