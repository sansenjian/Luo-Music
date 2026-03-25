import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApiService, resolveTimeoutKey } from '@/services/apiService'
import { AppError, ErrorCode } from '@/utils/error/types'

describe('apiService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined
    })
  })

  it('delegates to electronAPI when available', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ ok: true })
    const fetchSpy = vi.fn()

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { apiRequest }
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = createApiService()
    const result = await service.request('qq', '/search', { keyword: 'jay' })

    expect(result).toEqual({ ok: true })
    expect(apiRequest).toHaveBeenCalledWith('qq', '/search', { keyword: 'jay' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('builds browser request urls and filters undefined query params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ songs: [] })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = createApiService()
    const result = await service.request('qq', 'search', {
      keyword: 'jay',
      page: 1,
      skip: undefined
    })

    expect(result).toEqual({ songs: [] })
    // 验证 fetch 调用包含必要的参数（signal 是 AbortController 的信号）
    expect(fetchSpy).toHaveBeenCalledWith('/qq-api/search?keyword=jay&page=1', {
      method: 'GET',
      credentials: 'include',
      signal: expect.any(AbortSignal)
    })
  })

  it('throws when browser api request fails', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 503
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = createApiService()

    await expect(service.request('netease', '/playlist/detail')).rejects.toMatchObject({
      name: 'AppError',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'netease: API request failed: 503'
    } satisfies Partial<AppError>)
  })

  it('throws timeout error when request takes too long', async () => {
    // 创建一个不会 resolve 的 fetch mock
    const fetchSpy = vi.fn().mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          // 模拟 AbortError
          setTimeout(() => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          }, 100)
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const service = createApiService()

    await expect(service.request('netease', 'search', { keyword: 'test' })).rejects.toMatchObject({
      name: 'AppError'
    })
  })

  it('resolves timeout keys from normalized endpoints', () => {
    expect(resolveTimeoutKey('/song/url')).toBe('song/url')
    expect(resolveTimeoutKey('/cloudsearch')).toBe('cloudsearch')
    expect(resolveTimeoutKey('/playlist/detail')).toBe('playlist')
  })
})
