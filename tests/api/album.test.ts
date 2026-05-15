import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/http', () => ({
  default: requestMock
}))

import { getAlbumDetail, getAlbumSublist } from '@/api/album'

describe('album api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unwraps axios responses for album detail requests', async () => {
    requestMock.mockResolvedValue({
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

    expect(requestMock).toHaveBeenCalledWith({
      url: '/album',
      method: 'get',
      params: { id: 1 }
    })
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
    requestMock.mockResolvedValue(payload)

    const result = await getAlbumSublist(20, 40)

    expect(requestMock).toHaveBeenCalledWith({
      url: '/album/sublist',
      method: 'get',
      params: {
        limit: 20,
        offset: 40
      }
    })
    expect(result).toEqual(payload)
  })
})
