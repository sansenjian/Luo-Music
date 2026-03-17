import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApiService } from '@/services/apiService'

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
    expect(fetchSpy).toHaveBeenCalledWith('/qq-api/search?keyword=jay&page=1', {
      method: 'GET',
      credentials: 'include'
    })
  })

  it('throws when browser api request fails', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 503
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = createApiService()

    await expect(service.request('netease', '/playlist/detail')).rejects.toThrow(
      'API request failed: 503'
    )
  })
})
