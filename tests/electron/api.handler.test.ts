import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const executeWithRetryMock = vi.hoisted(() => vi.fn())
const getCacheMock = vi.hoisted(() => vi.fn(() => null))
const setCacheMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())

vi.mock('../../electron/ipc/IpcService', () => ({
  ipcService: {
    registerInvoke: registerInvokeMock
  }
}))

vi.mock('../../electron/ipc/utils/gatewayCache.ts', () => ({
  executeWithRetry: executeWithRetryMock,
  getCache: getCacheMock,
  setCache: setCacheMock
}))

vi.mock('../../electron/logger', () => ({
  default: {
    error: loggerErrorMock,
    warn: loggerWarnMock
  }
}))

describe('api.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeWithRetryMock.mockImplementation((fn: () => unknown) => fn())
    getCacheMock.mockReturnValue(null)
  })

  it('registers specific API handlers and maps search to the correct backend endpoint', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({ song: { list: [] } }),
      getAvailableServices: vi.fn(() => ({ qq: { status: 'ready' }, netease: { status: 'ready' } }))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const search = invokeHandlers.get('api:search')
    expect(search).toBeTypeOf('function')

    await expect(
      search?.({
        keyword: 'jay',
        platform: 'qq',
        page: 2,
        limit: 10
      })
    ).resolves.toEqual({ song: { list: [] } })

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('qq', 'getSearchByKey', {
      key: 'jay',
      type: undefined,
      page: 2,
      limit: 10
    })
  })

  it('maps netease search type strings to numeric API codes', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({ result: { artists: [] } }),
      getAvailableServices: vi.fn(() => ({ netease: { status: 'ready' } }))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const search = invokeHandlers.get('api:search')
    await search?.({
      keyword: 'jay',
      platform: 'netease',
      type: 'artist',
      page: 3,
      limit: 15
    })

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('netease', 'cloudsearch', {
      keywords: 'jay',
      type: 100,
      limit: 15,
      offset: 30
    })
  })

  it('normalizes song url responses for both platforms', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi
        .fn()
        .mockResolvedValueOnce({
          playUrl: {
            '123': { url: 'https://qq.test/song.mp3' }
          }
        })
        .mockResolvedValueOnce({
          data: [{ url: 'https://netease.test/song.mp3' }]
        }),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const getSongUrl = invokeHandlers.get('api:get-song-url')
    expect(getSongUrl).toBeTypeOf('function')

    await expect(getSongUrl?.({ id: '123', platform: 'qq' })).resolves.toEqual({
      url: 'https://qq.test/song.mp3'
    })
    await expect(getSongUrl?.({ id: '456', platform: 'netease' })).resolves.toEqual({
      url: 'https://netease.test/song.mp3'
    })

    expect(serviceManager.handleRequest).toHaveBeenNthCalledWith(1, 'qq', 'getMusicPlay', {
      songmid: '123',
      mediaId: undefined,
      quality: undefined,
      resType: 'play'
    })
    expect(serviceManager.handleRequest).toHaveBeenNthCalledWith(2, 'netease', 'song/url/v1', {
      id: '456',
      level: 'standard'
    })
  })

  it('normalizes QQ lyric payloads when nested lyric objects are returned', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({
        lyric: { lyric: '[00:00.00]主歌词' },
        tlyric: { lyric: '[00:00.00]翻译歌词' },
        romalrc: { lyric: '[00:00.00]roma lyric' }
      }),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const getLyric = invokeHandlers.get('api:get-lyric')

    await expect(getLyric?.({ id: '123', platform: 'qq' })).resolves.toEqual({
      lyric: '[00:00.00]主歌词',
      translated: '[00:00.00]翻译歌词',
      romalrc: '[00:00.00]roma lyric'
    })
  })

  it('falls back to the legacy netease song url endpoint when v1 returns no url', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ url: null }]
        })
        .mockResolvedValueOnce({
          data: [{ url: 'https://netease.test/fallback.mp3' }]
        }),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const getSongUrl = invokeHandlers.get('api:get-song-url')
    await expect(getSongUrl?.({ id: '456', platform: 'netease' })).resolves.toEqual({
      url: 'https://netease.test/fallback.mp3'
    })

    expect(serviceManager.handleRequest).toHaveBeenNthCalledWith(1, 'netease', 'song/url/v1', {
      id: '456',
      level: 'standard'
    })
    expect(serviceManager.handleRequest).toHaveBeenNthCalledWith(2, 'netease', 'song/url', {
      id: '456',
      br: 128000
    })
  })

  it('strips leading slashes for the generic API gateway route', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn().mockResolvedValue({ ok: true }),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const apiRequest = invokeHandlers.get('api:request')
    await expect(
      apiRequest?.({
        service: 'qq',
        endpoint: '/search',
        params: { keyword: 'jay' }
      })
    ).resolves.toEqual({
      success: true,
      data: { ok: true },
      cached: false
    })

    expect(serviceManager.handleRequest).toHaveBeenCalledWith('qq', 'search', {
      keyword: 'jay'
    })
  })

  it('returns structured error details for failed gateway requests', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const upstreamError = Object.assign(new Error('gateway timeout'), {
      code: 'ECONNABORTED',
      response: {
        status: 504,
        data: { traceId: 'xyz' }
      }
    })

    const serviceManager = {
      handleRequest: vi.fn().mockRejectedValue(upstreamError),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const apiRequest = invokeHandlers.get('api:request')
    await expect(
      apiRequest?.({
        service: 'qq',
        endpoint: '/search',
        params: { keyword: 'jay' }
      })
    ).resolves.toEqual({
      success: false,
      error: 'gateway timeout',
      errorDetails: {
        code: 'ECONNABORTED',
        status: 504,
        responseData: { traceId: 'xyz' }
      }
    })
  })

  it('validates service parameter in API request', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn(),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const apiRequest = invokeHandlers.get('api:request')

    // 无效的服务名
    await expect(
      apiRequest?.({
        service: 'malicious',
        endpoint: 'search',
        params: {}
      })
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('Invalid service')
    })

    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it('blocks dangerous endpoint patterns', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn(),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const apiRequest = invokeHandlers.get('api:request')

    // 路径遍历攻击
    await expect(
      apiRequest?.({
        service: 'netease',
        endpoint: '../../../etc/passwd',
        params: {}
      })
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('dangerous characters')
    })

    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it('validates required parameters for search', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })

    const serviceManager = {
      handleRequest: vi.fn(),
      getAvailableServices: vi.fn(() => ({}))
    }

    const { registerApiHandlers } = await import('../../electron/ipc/handlers/api.handler.ts')
    registerApiHandlers(serviceManager as never)

    const search = invokeHandlers.get('api:search')

    // 缺少 keyword 参数
    await expect(
      search?.({
        platform: 'qq'
      })
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining('Missing required parameter')
    })
  })
})
