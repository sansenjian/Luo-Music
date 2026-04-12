import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogLevel, type ILogger } from '@/services/loggerService'

const warnMock = vi.hoisted(() => vi.fn())
const createLoggerMock = vi.hoisted(() =>
  vi.fn(
    (): ILogger => ({
      resource: 'music-platform-test',
      setLevel: vi.fn(),
      getLevel: vi.fn(() => LogLevel.Info),
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: warnMock,
      error: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn()
    })
  )
)

vi.mock('@/services', () => ({
  services: {
    logger: () => ({
      createLogger: createLoggerMock
    })
  }
}))

type QQAdapterModuleFactory = () => {
  QQMusicAdapter: new () => {
    kind: 'qq'
  }
}

function mockAdapterModules(options: { qqFactory?: QQAdapterModuleFactory } = {}) {
  vi.doMock('@/platform/music/netease', () => ({
    NeteaseAdapter: class {
      readonly kind = 'netease'
    }
  }))

  vi.doMock(
    '@/platform/music/qq',
    options.qqFactory
      ? options.qqFactory
      : () => ({
          QQMusicAdapter: class {
            readonly kind = 'qq'
          }
        })
  )
}

describe('platform music index', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockAdapterModules()
  })

  it('returns the requested adapter when known', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('qq')).resolves.toMatchObject({ kind: 'qq' })
  })

  it('falls back to netease and warns on unknown platforms', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('unknown')).resolves.toMatchObject({ kind: 'netease' })
    expect(warnMock).toHaveBeenCalled()
  })

  it('treats prototype keys as unknown platforms and falls back safely', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('__proto__')).resolves.toMatchObject({ kind: 'netease' })
    await expect(getMusicAdapter('toString')).resolves.toMatchObject({ kind: 'netease' })
    await expect(getMusicAdapter('constructor')).resolves.toMatchObject({ kind: 'netease' })
    expect(warnMock).toHaveBeenCalled()
  })

  it('lists the available platform metadata', async () => {
    const { getAvailablePlatforms } = await import('@/platform/music')

    expect(getAvailablePlatforms()).toEqual([
      { id: 'netease', name: 'Netease Music' },
      { id: 'qq', name: 'QQ Music' }
    ])
  })

  it('reuses the lazily created logger across repeated fallback lookups', async () => {
    vi.resetModules()
    mockAdapterModules()
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('unknown-a')).resolves.toMatchObject({ kind: 'netease' })
    await expect(getMusicAdapter('unknown-b')).resolves.toMatchObject({ kind: 'netease' })

    expect(createLoggerMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledTimes(2)
  })

  it('supports an injected logger factory for fallback warnings', async () => {
    vi.resetModules()
    mockAdapterModules()
    const injectedWarn = vi.fn()
    const { configureMusicPlatformDeps, getMusicAdapter, resetMusicPlatformDeps } =
      await import('@/platform/music')

    configureMusicPlatformDeps({
      createLogger: (): ILogger => ({
        resource: 'music-platform-test',
        setLevel: vi.fn(),
        getLevel: vi.fn(() => LogLevel.Info),
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: injectedWarn,
        error: vi.fn(),
        flush: vi.fn(),
        dispose: vi.fn()
      })
    })

    await expect(getMusicAdapter('missing-platform')).resolves.toMatchObject({ kind: 'netease' })
    expect(injectedWarn).toHaveBeenCalledTimes(1)

    resetMusicPlatformDeps()
  })

  it('loads each adapter module at most once, even for concurrent requests', async () => {
    vi.resetModules()

    const loaderCallCount = { qq: 0 }
    mockAdapterModules({
      qqFactory: () => {
        loaderCallCount.qq += 1
        return {
          QQMusicAdapter: class {
            readonly kind = 'qq'
          }
        }
      }
    })

    const { getMusicAdapter } = await import('@/platform/music')
    const firstPromise = getMusicAdapter('qq')
    const secondPromise = getMusicAdapter('qq')

    expect(firstPromise).toBe(secondPromise)
    await expect(firstPromise).resolves.toMatchObject({ kind: 'qq' })
    expect(loaderCallCount.qq).toBe(1)
  })

  it('retries loading an adapter after a failed import and does not cache the failure', async () => {
    vi.resetModules()

    let qqConstructionCount = 0
    mockAdapterModules({
      qqFactory: () => {
        return {
          QQMusicAdapter: class {
            constructor() {
              qqConstructionCount += 1

              if (qqConstructionCount === 1) {
                throw new Error('qq adapter load failed')
              }
            }

            readonly kind = 'qq'
          }
        }
      }
    })

    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('qq')).rejects.toThrow('qq adapter load failed')
    await expect(getMusicAdapter('qq')).resolves.toMatchObject({ kind: 'qq' })
    expect(qqConstructionCount).toBe(2)
  })
})
