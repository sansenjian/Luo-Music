import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicPlatformAdapter } from '@/platform/music/interface'
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

type TestAdapter = MusicPlatformAdapter & { kind: string }

function createTestAdapter(kind: string): TestAdapter {
  return {
    platformId: kind,
    kind,
    search: vi.fn(),
    getSongUrl: vi.fn(),
    getSongDetail: vi.fn(),
    getLyric: vi.fn(),
    getPlaylistDetail: vi.fn()
  } as unknown as TestAdapter
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('platform music index', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns the requested adapter when known', async () => {
    const {
      configureMusicPlatformDeps,
      getMusicAdapter,
      resetMusicPlatformDeps,
      replaceRuntimePlatformDescriptors
    } = await import('@/platform/music')

    replaceRuntimePlatformDescriptors([
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'builtin',
        runtime: 'local',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    configureMusicPlatformDeps({
      resolveAdapter: async platformId => createTestAdapter(platformId)
    })

    await expect(getMusicAdapter('qq')).resolves.toMatchObject({ kind: 'qq' })

    resetMusicPlatformDeps()
  })

  it('rejects unknown platforms instead of falling back silently', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('unknown')).rejects.toThrow(
      'Music platform "unknown" is not registered'
    )
    expect(warnMock).toHaveBeenCalledTimes(1)
  })

  it('rejects descriptor-only platforms that do not expose a runtime adapter', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('local')).rejects.toThrow('local')
  })

  it('treats prototype keys as unknown platforms and rejects safely', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('__proto__')).rejects.toThrow(
      'Music platform "__proto__" is not registered'
    )
    await expect(getMusicAdapter('toString')).rejects.toThrow(
      'Music platform "toString" is not registered'
    )
    await expect(getMusicAdapter('constructor')).rejects.toThrow(
      'Music platform "constructor" is not registered'
    )
    expect(warnMock).toHaveBeenCalledTimes(3)
  })

  it('exposes platform descriptors and available platform metadata', async () => {
    const {
      getAvailablePlatforms,
      getPlatformDescriptor,
      getLoginPlatformOptions,
      resolvePlatformLoginRoute,
      getSearchPlatformOptions,
      getPlatformCapabilities,
      replaceRuntimePlatformDescriptors
    } = await import('@/platform/music')

    // Simulate runtime registration of external plugins
    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        category: 'api',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      },
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'qr',
            modes: ['qr']
          }
        }
      }
    ])

    expect(getPlatformDescriptor('netease')).toMatchObject({
      id: 'netease',
      displayName: 'Netease Music',
      category: 'api',
      capabilities: {
        search: true,
        needsHydration: true,
        supportsLyricFetch: true,
        supportsUrlRefreshOnFailure: true
      }
    })
    expect(getPlatformDescriptor('qq')).toMatchObject({
      id: 'qq',
      capabilities: {
        playlistDetail: false,
        supportsLyricFetch: true
      }
    })
    expect(getPlatformCapabilities('local')).toMatchObject({
      search: true,
      supportsLyricFetch: false
    })
    expect(getSearchPlatformOptions()).toEqual([
      { value: 'netease', label: 'Netease Music' },
      { value: 'qq', label: 'QQ Music' },
      { value: 'local', label: '本地音乐' }
    ])
    expect(getLoginPlatformOptions()).toEqual([
      { value: 'netease', label: 'Netease Music' },
      { value: 'qq', label: 'QQ Music' }
    ])
    expect(resolvePlatformLoginRoute(getPlatformDescriptor('netease')!)).toEqual({
      kind: 'legacy',
      platformId: 'netease',
      bridge: 'netease-login-modal'
    })
    expect(resolvePlatformLoginRoute(getPlatformDescriptor('qq')!)).toEqual({
      kind: 'legacy',
      platformId: 'qq',
      bridge: 'qq-login-modal'
    })
    expect(getAvailablePlatforms()).toEqual([
      { id: 'local', name: '本地音乐' },
      { id: 'netease', name: 'Netease Music' },
      { id: 'qq', name: 'QQ Music' }
    ])
  })

  it('requires auth.login capability before platforms are listed as login options', async () => {
    const { getLoginPlatformOptions, replaceRuntimePlatformDescriptors } =
      await import('@/platform/music')

    replaceRuntimePlatformDescriptors([
      {
        id: 'netease',
        displayName: 'Netease Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: true,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: true
        }
      },
      {
        id: 'search-only',
        displayName: 'Search Only',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: false,
          songDetail: false,
          lyric: false,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: false,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    expect(getLoginPlatformOptions()).toEqual([])
  })

  it('routes non-legacy login-capable platforms to the generic plugin login container', async () => {
    const { getPlatformDescriptor, resolvePlatformLoginRoute, replaceRuntimePlatformDescriptors } =
      await import('@/platform/music')

    replaceRuntimePlatformDescriptors([
      {
        id: 'kugou',
        displayName: 'Kugou Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false,
          auth: {
            login: true,
            preferredMode: 'browser',
            modes: ['browser']
          }
        }
      }
    ])

    const platform = getPlatformDescriptor('kugou')!
    expect(resolvePlatformLoginRoute(platform)).toEqual({
      kind: 'plugin',
      platform
    })
  })

  it('centralizes legacy login bridge routing and primary profile platform metadata', async () => {
    const {
      getLegacyLoginBridgePlatformId,
      getPrimaryProfilePlatformId,
      isPlatformRepresentedByPrimaryProfile,
      resolveLegacyLoginBridge
    } = await import('@/platform/music')

    expect(resolveLegacyLoginBridge('netease')).toBe('netease-login-modal')
    expect(resolveLegacyLoginBridge('qq')).toBe('qq-login-modal')
    expect(getLegacyLoginBridgePlatformId('netease-login-modal')).toBe('netease')
    expect(getLegacyLoginBridgePlatformId('qq-login-modal')).toBe('qq')
    expect(getPrimaryProfilePlatformId()).toBe('netease')
    expect(isPlatformRepresentedByPrimaryProfile('netease')).toBe(true)
    expect(isPlatformRepresentedByPrimaryProfile('qq')).toBe(false)
  })

  it('reuses the lazily created logger across repeated invalid lookups', async () => {
    const { getMusicAdapter } = await import('@/platform/music')

    await expect(getMusicAdapter('unknown-a')).rejects.toThrow(
      'Music platform "unknown-a" is not registered'
    )
    await expect(getMusicAdapter('unknown-b')).rejects.toThrow(
      'Music platform "unknown-b" is not registered'
    )

    expect(createLoggerMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledTimes(2)
  })

  it('supports an injected logger factory for invalid platform requests', async () => {
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

    await expect(getMusicAdapter('missing-platform')).rejects.toThrow(
      'Music platform "missing-platform" is not registered'
    )
    expect(injectedWarn).toHaveBeenCalledTimes(1)

    resetMusicPlatformDeps()
  })

  it('loads each adapter at most once, even for concurrent requests', async () => {
    const deferred = createDeferred<MusicPlatformAdapter>()
    const resolveAdapter = vi.fn(() => deferred.promise)
    const {
      configureMusicPlatformDeps,
      getMusicAdapter,
      resetMusicPlatformDeps,
      replaceRuntimePlatformDescriptors
    } = await import('@/platform/music')

    replaceRuntimePlatformDescriptors([
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'builtin',
        runtime: 'local',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    configureMusicPlatformDeps({ resolveAdapter })

    const firstPromise = getMusicAdapter('qq')
    const secondPromise = getMusicAdapter('qq')

    expect(firstPromise).toBe(secondPromise)
    expect(resolveAdapter).toHaveBeenCalledTimes(1)

    deferred.resolve(createTestAdapter('qq'))
    await expect(firstPromise).resolves.toMatchObject({ kind: 'qq' })

    resetMusicPlatformDeps()
  })

  it('retries loading an adapter after a failed resolve and does not cache the failure', async () => {
    const resolveAdapter = vi.fn(
      async (platformId: string): Promise<MusicPlatformAdapter> => createTestAdapter(platformId)
    )
    resolveAdapter.mockRejectedValueOnce(new Error('qq adapter load failed'))
    resolveAdapter.mockResolvedValueOnce(createTestAdapter('qq'))

    const {
      configureMusicPlatformDeps,
      getMusicAdapter,
      resetMusicPlatformDeps,
      replaceRuntimePlatformDescriptors
    } = await import('@/platform/music')

    replaceRuntimePlatformDescriptors([
      {
        id: 'qq',
        displayName: 'QQ Music',
        source: 'builtin',
        runtime: 'local',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    configureMusicPlatformDeps({ resolveAdapter })

    await expect(getMusicAdapter('qq')).rejects.toThrow('qq adapter load failed')
    await expect(getMusicAdapter('qq')).resolves.toMatchObject({ kind: 'qq' })
    expect(resolveAdapter).toHaveBeenCalledTimes(2)

    resetMusicPlatformDeps()
  })
})
