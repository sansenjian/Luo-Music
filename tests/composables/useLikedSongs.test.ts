import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLikedSongs, type UseLikedSongsReturn } from '@/composables/useLikedSongs'
import { createDeferred } from '../helpers/deferred'
import { mountComposable } from '../helpers/mountComposable'
import { createMockSong } from '../utils/test-utils'

const getLikelistMock = vi.hoisted(() => vi.fn())
const getSongDetailMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/song', () => ({
  getLikelist: getLikelistMock,
  getSongDetail: getSongDetailMock
}))

function buildSongsFromIds(ids: number[]) {
  return ids.map(id =>
    createMockSong({
      id,
      originalId: id,
      name: `Song ${id}`,
      url: `https://song.test/${id}.mp3`
    })
  )
}

function mountUseLikedSongs() {
  const { result } = mountComposable<UseLikedSongsReturn>(() => useLikedSongs())
  return result
}

describe('useLikedSongs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads liked songs in 100-song pages while preserving the total count', async () => {
    const allIds = Array.from({ length: 250 }, (_, index) => index + 1)
    getLikelistMock.mockResolvedValue({
      ids: allIds
    })
    getSongDetailMock.mockImplementation(async (ids: string) => {
      const parsedIds = ids.split(',').map(id => Number(id))
      return {
        songs: buildSongsFromIds(parsedIds)
      }
    })

    const viewModel = mountUseLikedSongs()

    await viewModel.loadLikedSongs(1)
    await flushPromises()

    expect(viewModel.count.value).toBe(250)
    expect(viewModel.likeSongs.value).toHaveLength(100)
    expect(viewModel.likeSongs.value[0]?.id).toBe(1)
    expect(viewModel.likeSongs.value.at(-1)?.id).toBe(100)
    expect(viewModel.hasMore.value).toBe(true)
    expect(getSongDetailMock).toHaveBeenNthCalledWith(1, allIds.slice(0, 100).join(','))

    await viewModel.loadMoreLikedSongs()
    await flushPromises()

    expect(viewModel.likeSongs.value).toHaveLength(200)
    expect(viewModel.likeSongs.value.at(-1)?.id).toBe(200)
    expect(viewModel.hasMore.value).toBe(true)
    expect(getSongDetailMock).toHaveBeenNthCalledWith(2, allIds.slice(100, 200).join(','))

    await viewModel.loadMoreLikedSongs()
    await flushPromises()

    expect(viewModel.likeSongs.value).toHaveLength(250)
    expect(viewModel.likeSongs.value.at(-1)?.id).toBe(250)
    expect(viewModel.hasMore.value).toBe(false)
    expect(getSongDetailMock).toHaveBeenNthCalledWith(3, allIds.slice(200, 250).join(','))
  })

  it('ignores duplicate load-more calls while the next page is still loading', async () => {
    const allIds = Array.from({ length: 220 }, (_, index) => index + 1)
    const secondPageDeferred = createDeferred<{ songs: ReturnType<typeof buildSongsFromIds> }>()

    getLikelistMock.mockResolvedValue({
      ids: allIds
    })
    getSongDetailMock
      .mockResolvedValueOnce({
        songs: buildSongsFromIds(allIds.slice(0, 100))
      })
      .mockImplementationOnce(() => secondPageDeferred.promise)

    const viewModel = mountUseLikedSongs()

    await viewModel.loadLikedSongs(1)
    await flushPromises()

    const firstLoadMore = viewModel.loadMoreLikedSongs()
    const secondLoadMore = viewModel.loadMoreLikedSongs()

    expect(viewModel.loadingMore.value).toBe(true)
    expect(getSongDetailMock).toHaveBeenCalledTimes(2)

    secondPageDeferred.resolve({
      songs: buildSongsFromIds(allIds.slice(100, 200))
    })

    await Promise.all([firstLoadMore, secondLoadMore])
    await flushPromises()

    expect(viewModel.likeSongs.value).toHaveLength(200)
    expect(viewModel.loadingMore.value).toBe(false)
    expect(getSongDetailMock).toHaveBeenCalledTimes(2)
  })

  it('stores load failures and can retry the last requested user', async () => {
    const expectedError = new Error('network down')

    getLikelistMock.mockRejectedValueOnce(expectedError).mockResolvedValueOnce({
      ids: [11, 12]
    })
    getSongDetailMock.mockResolvedValue({
      songs: buildSongsFromIds([11, 12])
    })

    const viewModel = mountUseLikedSongs()

    await viewModel.loadLikedSongs(42)
    await flushPromises()

    expect(viewModel.error.value).toBe(expectedError)
    expect(viewModel.likeSongs.value).toHaveLength(0)

    await viewModel.retryLoadLikedSongs()
    await flushPromises()

    expect(getLikelistMock).toHaveBeenNthCalledWith(2, 42)
    expect(viewModel.error.value).toBeNull()
    expect(viewModel.likeSongs.value).toHaveLength(2)
    expect(viewModel.likeSongs.value[0]?.id).toBe(11)
  })

  it('normalizes raw liked-song details before exposing them to the UI', async () => {
    getLikelistMock.mockResolvedValue({
      ids: ['song-1']
    })
    getSongDetailMock.mockResolvedValue({
      songs: [
        {
          id: 'song-1',
          name: 'Raw Song',
          ar: [{ id: 7, name: 'Raw Artist' }],
          al: { id: 9, name: 'Raw Album', picUrl: 'raw-cover.jpg' },
          dt: 215000,
          mv: 11
        }
      ]
    })

    const viewModel = mountUseLikedSongs()

    await viewModel.loadLikedSongs(1)
    await flushPromises()

    expect(viewModel.likeSongs.value).toHaveLength(1)
    expect(viewModel.likeSongs.value[0]).toMatchObject({
      id: 'song-1',
      name: 'Raw Song',
      artists: [{ id: 7, name: 'Raw Artist' }],
      album: { id: 9, name: 'Raw Album', picUrl: 'raw-cover.jpg' },
      duration: 215000,
      mvid: 11,
      platform: 'netease',
      originalId: 'song-1'
    })
  })
})
