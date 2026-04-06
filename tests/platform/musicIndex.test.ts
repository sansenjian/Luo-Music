import { beforeEach, describe, expect, it, vi } from 'vitest'

const warnMock = vi.hoisted(() => vi.fn())
const createLoggerMock = vi.hoisted(() =>
  vi.fn(() => ({
    warn: warnMock
  }))
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

    expect(getMusicAdapter('qq')).toMatchObject({ kind: 'qq' })
  })

  it('falls back to netease and warns on unknown platforms', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    expect(getMusicAdapter('unknown')).toMatchObject({ kind: 'netease' })
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

    expect(getMusicAdapter('unknown-a')).toMatchObject({ kind: 'netease' })
    expect(getMusicAdapter('unknown-b')).toMatchObject({ kind: 'netease' })

    expect(createLoggerMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledTimes(2)
  })

  it('supports an injected logger factory for fallback warnings', async () => {
    vi.resetModules()
    const injectedWarn = vi.fn()
    const { configureMusicPlatformDeps, getMusicAdapter, resetMusicPlatformDeps } =
      await import('@/platform/music')

    configureMusicPlatformDeps({
      createLogger: () =>
        ({
          warn: injectedWarn
        }) as { warn: typeof injectedWarn }
    })

    expect(getMusicAdapter('missing-platform')).toMatchObject({ kind: 'netease' })
    expect(injectedWarn).toHaveBeenCalledTimes(1)

    resetMusicPlatformDeps()
  })
})
