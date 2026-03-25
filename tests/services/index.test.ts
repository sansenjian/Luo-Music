import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerServiceMock = vi.hoisted(() => vi.fn())
const getServiceMock = vi.hoisted(() => vi.fn())
const resetServicesMock = vi.hoisted(() => vi.fn())
const activateRegisteredServicesMock = vi.hoisted(() => vi.fn())
const activateRegisteredServiceMock = vi.hoisted(() => vi.fn())
const deactivateRegisteredServicesMock = vi.hoisted(() => vi.fn())
const deactivateRegisteredServiceMock = vi.hoisted(() => vi.fn())
const resetServicesAsyncMock = vi.hoisted(() => vi.fn())

const createPlatformServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'platform' })))
const createApiServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'api' })))
const createLoggerServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'logger' })))
const createErrorServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'error' })))
const createConfigServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'config' })))
const createContextKeyServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'context' })))
const createCommandServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'command' })))
const createPlayerServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'player' })))
const createMusicServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'music' })))
const createStorageServiceMock = vi.hoisted(() => vi.fn(() => ({ kind: 'storage' })))

const ids = vi.hoisted(() => ({
  IPlatformService: Symbol('platform'),
  IApiService: Symbol('api'),
  ILoggerService: Symbol('logger'),
  IErrorService: Symbol('error'),
  IConfigService: Symbol('config'),
  IContextKeyService: Symbol('context'),
  ICommandService: Symbol('command'),
  IPlayerService: Symbol('player'),
  IMusicService: Symbol('music'),
  IStorageService: Symbol('storage'),
  createDecorator: vi.fn()
}))

vi.mock('@/services/registry', () => ({
  activateRegisteredServices: activateRegisteredServicesMock,
  activateService: activateRegisteredServiceMock,
  deactivateRegisteredServices: deactivateRegisteredServicesMock,
  deactivateService: deactivateRegisteredServiceMock,
  getService: getServiceMock,
  registerService: registerServiceMock,
  resetServices: resetServicesMock,
  resetServicesAsync: resetServicesAsyncMock
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

vi.mock('@/services/playerService', () => ({
  createPlayerService: createPlayerServiceMock
}))

vi.mock('@/services/musicService', () => ({
  createMusicService: createMusicServiceMock
}))

vi.mock('@/services/storageService', () => ({
  createStorageService: createStorageServiceMock
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

    expect(registerServiceMock).toHaveBeenCalledTimes(10)
    expect(registerServiceMock).toHaveBeenCalledWith(
      ids.IPlatformService,
      createPlatformServiceMock
    )
    expect(registerServiceMock).toHaveBeenCalledWith(ids.IApiService, createApiServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith(ids.ILoggerService, createLoggerServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith(ids.IPlayerService, createPlayerServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith(ids.IMusicService, createMusicServiceMock)
    expect(registerServiceMock).toHaveBeenCalledWith(ids.IStorageService, createStorageServiceMock)
  })

  it('supports overrides with typed identifiers', async () => {
    vi.resetModules()
    const module = await import('@/services')
    const platformOverride = { kind: 'override-platform' }
    const commandOverride = { kind: 'override-command' }
    const playerOverride = { kind: 'override-player' }
    const musicOverride = { kind: 'override-music' }
    const storageOverride = { kind: 'override-storage' }

    module.setupServices({
      platform: platformOverride as never,
      command: commandOverride as never,
      player: playerOverride as never,
      music: musicOverride as never,
      storage: storageOverride as never
    })

    expect(resetServicesMock).toHaveBeenCalled()

    const findOverrideFactory = (identifier: unknown, defaultFactory: unknown) =>
      registerServiceMock.mock.calls.find(
        ([id, factory]) => id === identifier && factory !== defaultFactory
      )?.[1]

    expect(findOverrideFactory(ids.IPlatformService, createPlatformServiceMock)?.()).toBe(
      platformOverride
    )
    expect(findOverrideFactory(ids.ICommandService, createCommandServiceMock)?.()).toBe(
      commandOverride
    )
    expect(findOverrideFactory(ids.IPlayerService, createPlayerServiceMock)?.()).toBe(
      playerOverride
    )
    expect(findOverrideFactory(ids.IMusicService, createMusicServiceMock)?.()).toBe(musicOverride)
    expect(findOverrideFactory(ids.IStorageService, createStorageServiceMock)?.()).toBe(
      storageOverride
    )
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
      command: { kind: 'override-command' },
      player: { kind: 'override-player' },
      music: { kind: 'override-music' },
      storage: { kind: 'override-storage' }
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
    expect(findOverrideFactory(ids.IErrorService, createErrorServiceMock)?.()).toBe(overrides.error)
    expect(findOverrideFactory(ids.IConfigService, createConfigServiceMock)?.()).toBe(
      overrides.config
    )
    expect(findOverrideFactory(ids.IContextKeyService, createContextKeyServiceMock)?.()).toBe(
      overrides.context
    )
    expect(findOverrideFactory(ids.ICommandService, createCommandServiceMock)?.()).toBe(
      overrides.command
    )
    expect(findOverrideFactory(ids.IPlayerService, createPlayerServiceMock)?.()).toBe(
      overrides.player
    )
    expect(findOverrideFactory(ids.IMusicService, createMusicServiceMock)?.()).toBe(overrides.music)
    expect(findOverrideFactory(ids.IStorageService, createStorageServiceMock)?.()).toBe(
      overrides.storage
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
    expect(module.services.player()).toEqual({ identifier: ids.IPlayerService })
    expect(module.services.music()).toEqual({ identifier: ids.IMusicService })
    expect(module.services.storage()).toEqual({ identifier: ids.IStorageService })
  })

  it('supports async initialization orchestration with lifecycle-aware activation', async () => {
    vi.resetModules()
    const module = await import('@/services')

    await module.initializeServices({}, ['music', 'player'])

    expect(activateRegisteredServicesMock).toHaveBeenCalledWith([
      ids.IMusicService,
      ids.IPlayerService
    ])
  })

  it('supports scoped service deactivation and async teardown', async () => {
    vi.resetModules()
    const module = await import('@/services')

    await module.deactivateServices(['music', 'player'])
    expect(deactivateRegisteredServicesMock).toHaveBeenCalledWith([
      ids.IMusicService,
      ids.IPlayerService
    ])

    await module.resetServicesAsync()
    expect(resetServicesAsyncMock).toHaveBeenCalledTimes(1)
  })
})
