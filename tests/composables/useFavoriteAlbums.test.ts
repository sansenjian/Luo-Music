import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFavoriteAlbums, type UseFavoriteAlbumsReturn } from '@/composables/useFavoriteAlbums'

const getAlbumDetailMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/album', () => ({
  getAlbumDetail: getAlbumDetailMock,
  getAlbumSublist: getAlbumSublistMock
}))

function mountUseFavoriteAlbums() {
  let viewModel!: UseFavoriteAlbumsReturn

  const Harness = defineComponent({
    setup() {
      viewModel = useFavoriteAlbums()
      return () => null
    }
  })

  mount(Harness)

  return viewModel
}

describe('useFavoriteAlbums', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and normalizes paginated favorite albums', async () => {
    getAlbumSublistMock
      .mockResolvedValueOnce({
        count: 3,
        hasMore: true,
        data: [
          {
            id: 101,
            name: 'Album 101',
            picUrl: 'cover-101.jpg',
            size: 12,
            artist: { id: 7, name: 'Artist 7' }
          },
          {
            id: 102,
            name: 'Album 102',
            artists: [
              { id: 8, name: 'Artist 8' },
              { id: 9, name: 'Artist 9' }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        count: 3,
        hasMore: false,
        data: [
          {
            id: 103,
            name: 'Album 103',
            picUrl: 'cover-103.jpg',
            size: 8
          }
        ]
      })

    const viewModel = mountUseFavoriteAlbums()
    await viewModel.loadFavoriteAlbums('user-1')
    await flushPromises()

    expect(getAlbumSublistMock).toHaveBeenNthCalledWith(1, 50, 0)
    expect(getAlbumSublistMock).toHaveBeenNthCalledWith(2, 50, 2)
    expect(viewModel.count.value).toBe(3)
    expect(viewModel.albums.value).toEqual([
      expect.objectContaining({
        id: 101,
        name: 'Album 101',
        picUrl: 'cover-101.jpg',
        size: 12,
        artistName: 'Artist 7'
      }),
      expect.objectContaining({
        id: 102,
        name: 'Album 102',
        picUrl: '',
        size: 0,
        artistName: 'Artist 8 / Artist 9'
      }),
      expect.objectContaining({
        id: 103,
        name: 'Album 103',
        picUrl: 'cover-103.jpg',
        size: 8,
        artistName: ''
      })
    ])
  })

  it('loads and normalizes album songs from album detail', async () => {
    getAlbumDetailMock.mockResolvedValue({
      songs: [
        {
          id: 201,
          name: 'Album Track 1',
          ar: [{ id: 10, name: 'Artist 10' }],
          al: { id: 20, name: 'Album 20', picUrl: 'cover-20.jpg' },
          dt: 199000
        },
        {
          id: 202,
          name: 'Album Track 2'
        }
      ]
    })

    const viewModel = mountUseFavoriteAlbums()
    const songs = await viewModel.loadAlbumSongs(99)
    await flushPromises()

    expect(getAlbumDetailMock).toHaveBeenCalledWith(99)
    expect(songs).toHaveLength(2)
    expect(songs[0]).toMatchObject({
      id: 201,
      name: 'Album Track 1',
      artists: [{ id: 10, name: 'Artist 10' }],
      album: { id: 20, name: 'Album 20', picUrl: 'cover-20.jpg' },
      duration: 199000,
      platform: 'netease'
    })
    expect(songs[1]).toMatchObject({
      id: 202,
      name: 'Album Track 2',
      artists: [],
      album: { id: 0, name: '', picUrl: '' },
      platform: 'netease'
    })
  })
})
