import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAlbumDetail, getAlbumSublist } from '@/api/album'
import {
  configureNeteaseServiceApiDeps,
  resetNeteaseServiceApiDeps
} from '@/api/shared/neteaseServiceRequest'

const apiRequestMock = vi.fn()

describe('album api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configureNeteaseServiceApiDeps({
      getApiService: () => ({
        request: apiRequestMock
      }),
      getTimestamp: () => 1234567890,
      getCookie: () => null
    })
  })

  afterEach(() => {
    resetNeteaseServiceApiDeps()
  })

  it('unwraps axios responses for album detail requests', async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        album: {
          id: 1,
          name: 'Album 1'
        },
        songs: []
      },
      status: 200,
      headers: {},
      config: {}
    })

    const result = await getAlbumDetail(1)

    expect(apiRequestMock).toHaveBeenCalledWith('netease', '/album', { id: 1 })
    expect(result).toEqual({
      album: {
        id: 1,
        name: 'Album 1'
      },
      songs: []
    })
  })

  it('keeps plain payloads that contain a business data field intact', async () => {
    const payload = {
      count: 1,
      data: [
        {
          id: 101,
          name: 'Album 101'
        }
      ],
      hasMore: false
    }
    apiRequestMock.mockResolvedValue(payload)

    const result = await getAlbumSublist(20, 40)

    expect(apiRequestMock).toHaveBeenCalledWith('netease', '/album/sublist', {
      limit: 20,
      offset: 40
    })
    expect(result).toEqual(payload)
  })
})
