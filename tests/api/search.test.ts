import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getHotSearch, search, searchSuggest } from '@/api/search'
import {
  configureNeteaseServiceApiDeps,
  resetNeteaseServiceApiDeps
} from '@/api/shared/neteaseServiceRequest'

const apiRequestMock = vi.fn()
const authExpiredMock = vi.fn()

describe('search api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configureNeteaseServiceApiDeps({
      getApiService: () => ({
        request: apiRequestMock
      }),
      getTimestamp: () => 1234567890,
      getCookie: () => null,
      onAuthExpired: authExpiredMock
    })
  })

  afterEach(() => {
    resetNeteaseServiceApiDeps()
  })

  it('routes cloud search through ApiService', async () => {
    apiRequestMock.mockResolvedValue({ result: { songs: [] } })

    await search('jay', 1, 30, 60)

    expect(apiRequestMock).toHaveBeenCalledWith('netease', '/cloudsearch', {
      keywords: 'jay',
      type: 1,
      limit: 30,
      offset: 60
    })
  })

  it('keeps default cloud search params', async () => {
    apiRequestMock.mockResolvedValue({ result: { songs: [] } })

    await search('jay')

    expect(apiRequestMock).toHaveBeenCalledWith('netease', '/cloudsearch', {
      keywords: 'jay',
      type: 1,
      limit: 30,
      offset: 0
    })
  })

  it('routes search suggestions and hot search through ApiService', async () => {
    apiRequestMock.mockResolvedValue({})

    await searchSuggest('周杰伦')
    await getHotSearch()

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, 'netease', '/search/suggest', {
      keywords: '周杰伦'
    })
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, 'netease', '/search/hot/detail', {})
  })

  it('notifies when Netease returns an expired-login business code', async () => {
    apiRequestMock.mockResolvedValue({ code: 301 })

    await getHotSearch()

    expect(authExpiredMock).toHaveBeenCalledTimes(1)
  })
})
