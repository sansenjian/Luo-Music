import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFavoriteAlbums, type UseFavoriteAlbumsReturn } from '@/composables/useFavoriteAlbums'
import { createDeferred } from '../helpers/deferred'
import { mountComposable } from '../helpers/mountComposable'

const getAlbumDetailMock = vi.hoisted(() => vi.fn())
const getAlbumSublistMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/album', () => ({
  getAlbumDetail: getAlbumDetailMock,
  getAlbumSublist: getAlbumSublistMock
}))

function mountUseFavoriteAlbums() {
  const { result } = mountComposable<UseFavoriteAlbumsReturn>(() => useFavoriteAlbums())
  return result
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
      album: {
        id: 20,
        name: 'Album 20',
        picUrl: 'fallback-cover.jpg'
      },
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
      album: { id: 20, name: 'Album 20', picUrl: 'fallback-cover.jpg' },
      platform: 'netease'
    })
  })

  it('advances favorite album pagination by the raw page size before normalization', async () => {
    getAlbumSublistMock
      .mockResolvedValueOnce({
        count: 2,
        hasMore: true,
        data: [
          {
            id: 301,
            name: 'Album 301',
            picUrl: 'cover-301.jpg',
            size: 12,
            artist: { id: 7, name: 'Artist 7' }
          },
          {
            id: undefined,
            name: ''
          }
        ]
      })
      .mockResolvedValueOnce({
        count: 2,
        hasMore: false,
        data: [
          {
            id: 302,
            name: 'Album 302',
            picUrl: 'cover-302.jpg',
            size: 8
          }
        ]
      })

    const viewModel = mountUseFavoriteAlbums()
    await viewModel.loadFavoriteAlbums('user-1')
    await flushPromises()

    expect(getAlbumSublistMock).toHaveBeenNthCalledWith(1, 50, 0)
    expect(getAlbumSublistMock).toHaveBeenNthCalledWith(2, 50, 2)
    expect(viewModel.albums.value.map(album => album.id)).toEqual([301, 302])
  })

  it('surfaces album detail failures instead of silently returning an empty song list', async () => {
    getAlbumDetailMock.mockRejectedValue(new Error('album detail failed'))

    const viewModel = mountUseFavoriteAlbums()

    await expect(viewModel.loadAlbumSongs(88)).rejects.toThrow('album detail failed')
  })

  it('cancels stale album detail requests when a newer album load starts', async () => {
    const firstDetailDeferred = createDeferred<{
      album: { id: number; name: string; picUrl: string }
      songs: Array<{ id: number; name: string }>
    }>()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getAlbumDetailMock.mockImplementation((albumId: number) => {
      if (albumId === 101) {
        return firstDetailDeferred.promise
      }

      return Promise.resolve({
        album: {
          id: 102,
          name: 'Album 102',
          picUrl: 'cover-102.jpg'
        },
        songs: [
          {
            id: 1021,
            name: 'Album 102 Track 1'
          }
        ]
      })
    })

    const viewModel = mountUseFavoriteAlbums()
    const firstRequest = viewModel.loadAlbumSongs(101)
    const secondRequest = viewModel.loadAlbumSongs(102)

    firstDetailDeferred.resolve({
      album: {
        id: 101,
        name: 'Album 101',
        picUrl: 'cover-101.jpg'
      },
      songs: [
        {
          id: 1011,
          name: 'Album 101 Track 1'
        }
      ]
    })

    const [firstResult, secondResult] = await Promise.allSettled([firstRequest, secondRequest])
    await flushPromises()

    expect(getAlbumDetailMock).toHaveBeenNthCalledWith(1, 101)
    expect(getAlbumDetailMock).toHaveBeenNthCalledWith(2, 102)
    expect(firstResult.status).toBe('rejected')
    expect(secondResult).toMatchObject({
      status: 'fulfilled',
      value: [
        expect.objectContaining({
          id: 1021,
          name: 'Album 102 Track 1'
        })
      ]
    })
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
