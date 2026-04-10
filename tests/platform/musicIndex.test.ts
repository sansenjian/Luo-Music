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

vi.mock('@/platform/music/netease', () => ({
  NeteaseAdapter: class {
    readonly kind = 'netease'
  }
}))

vi.mock('@/platform/music/qq', () => ({
  QQMusicAdapter: class {
    readonly kind = 'qq'
  }
}))

describe('platform music index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('lists the available platform metadata', async () => {
    const { getAvailablePlatforms } = await import('@/platform/music')

    expect(getAvailablePlatforms()).toEqual([
      { id: 'netease', name: 'Netease Music' },
      { id: 'qq', name: 'QQ Music' }
    ])
  })

  it('reuses the lazily created logger across repeated fallback lookups', async () => {
    vi.resetModules()
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('unknown-a')).resolves.toMatchObject({ kind: 'netease' })
    await expect(getMusicAdapter('unknown-b')).resolves.toMatchObject({ kind: 'netease' })

    expect(createLoggerMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledTimes(2)
  })

  it('supports an injected logger factory for fallback warnings', async () => {
    vi.resetModules()
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
})
