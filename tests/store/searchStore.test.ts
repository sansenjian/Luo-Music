import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetServices } from '@/services/registry'
import { setupServices, services } from '@/services'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { createSearchStore, searchResultItemToSong, useSearchStore } from '@/store/searchStore'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createSearchSong(id: string | number, overrides: Partial<Song> = {}): Song {
  return {
    id,
    name: `Song ${String(id)}`,
    artists: [{ id: 1, name: 'Artist' }],
    album: { id: 1, name: 'Album', picUrl: 'cover.jpg' },
    duration: 180000,
    mvid: 0,
    platform: 'netease',
    originalId: id,
    ...overrides
  }
}

const adapterMock = {
  search: vi.fn()
}

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      music: vi.fn(() => adapterMock)
    }
  }
})

describe('searchStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    resetServices()
    setupServices({
      error: {
        handleApiError: (error: unknown) => ({
          message: error instanceof Error ? error.message : String(error)
        })
      } as never,
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as never
    })
  })

  it('preserves platform metadata when converting search items into songs', () => {
    const song = searchResultItemToSong({
      id: 'qq-song-mid',
      name: 'Track',
      artist: 'Singer',
      album: 'Album',
      pic: 'cover-a',
      cover: 'cover-b',
      url: null,
      platform: 'qq',
      duration: 215,
      mediaId: 'media-mid',
      mvid: 'mv-1'
    })

    expect(song.platform).toBe('qq')
    expect(song.album.picUrl).toBe('cover-b')
    expect(song.duration).toBe(215000)
    expect((song as Song & { mediaId?: string }).mediaId).toBe('media-mid')
    expect(song.mvid).toBe('mv-1')
  })

  it('supports isolated store instances with custom store ids', () => {
    const useSearchStoreA = createSearchStore({}, { storeId: 'search-store-a' })
    const useSearchStoreB = createSearchStore({}, { storeId: 'search-store-b' })

    const storeA = useSearchStoreA()
    const storeB = useSearchStoreB()

    storeA.setServer('qq')

    expect(storeA.$id).toBe('search-store-a')
    expect(storeB.$id).toBe('search-store-b')
    expect(storeB.server).toBe('netease')
  })

  it('exposes the first search page before later pages finish loading and appends the rest', async () => {
    const secondPage = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockImplementation(
      (_platform: string, keyword: string, limit: number, page: number) => {
        expect(keyword).toBe('paged')
        expect(limit).toBe(50)

        if (page === 1) {
          return Promise.resolve({
            list: [createSearchSong('song-1'), createSearchSong('song-2')],
            total: 3
          })
        }

        if (page === 2) {
          return secondPage.promise
        }

        throw new Error(`Unexpected page: ${page}`)
      }
    )

    const store = useSearchStore()
    const searchPromise = store.search('paged')

    await vi.waitFor(() => {
      expect(adapterMock.search).toHaveBeenNthCalledWith(1, 'netease', 'paged', 50, 1)
      expect(adapterMock.search).toHaveBeenNthCalledWith(2, 'netease', 'paged', 50, 2)
      expect(store.totalResults).toBe(3)
      expect(store.results.map(song => song.id)).toEqual(['song-1', 'song-2'])
      expect(store.isLoading).toBe(true)
    })

    secondPage.resolve({
      list: [createSearchSong('song-3')],
      total: 3
    })

    await searchPromise

    expect(store.totalResults).toBe(3)
    expect(store.results).toHaveLength(3)
    expect(store.results.map(song => song.id)).toEqual(['song-1', 'song-2', 'song-3'])
    expect(store.isLoading).toBe(false)
  })

  it('ignores stale search responses and keeps the latest results', async () => {
    const first = createDeferred<{ list: Song[]; total: number }>()
    const second = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockImplementation((_platform: string, keyword: string) => {
      if (keyword === 'first') return first.promise
      if (keyword === 'second') return second.promise
      throw new Error(`Unexpected keyword: ${keyword}`)
    })

    const store = useSearchStore()
    const firstRequest = store.search('first')
    const secondRequest = store.search('second')

    second.resolve({
      list: [
        {
          id: 'second-song',
          name: 'Second',
          artists: [{ id: 1, name: 'Artist B' }],
          album: { id: 2, name: 'Album B', picUrl: 'b.jpg' },
          duration: 180000,
          mvid: 0,
          platform: 'netease',
          originalId: 'second-song'
        }
      ],
      total: 1
    })

    await secondRequest

    expect(store.keyword).toBe('second')
    expect(store.results).toHaveLength(1)
    expect(store.results[0].id).toBe('second-song')
    expect(store.isLoading).toBe(false)

    first.resolve({
      list: [
        {
          id: 'first-song',
          name: 'First',
          artists: [{ id: 1, name: 'Artist A' }],
          album: { id: 2, name: 'Album A', picUrl: 'a.jpg' },
          duration: 200000,
          mvid: 0,
          platform: 'netease',
          originalId: 'first-song'
        }
      ],
      total: 1
    })

    await firstRequest

    expect(store.results).toHaveLength(1)
    expect(store.results[0].id).toBe('second-song')
    expect(store.isLoading).toBe(false)
  })

  it('cancels stale paginated searches and keeps the latest completed results', async () => {
    const firstPage = createDeferred<{ list: Song[]; total: number }>()
    const secondPage = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockImplementation(
      (_platform: string, keyword: string, limit: number, page: number) => {
        expect(limit).toBe(50)

        if (keyword === 'first' && page === 1) {
          return firstPage.promise
        }

        if (keyword === 'first' && page === 2) {
          return secondPage.promise
        }

        if (keyword === 'second' && page === 1) {
          return Promise.resolve({
            list: [createSearchSong('second-song')],
            total: 1
          })
        }

        throw new Error(`Unexpected request: ${keyword}:${page}`)
      }
    )

    const store = useSearchStore()
    const firstRequest = store.search('first')

    firstPage.resolve({
      list: [createSearchSong('first-song')],
      total: 2
    })

    await vi.waitFor(() => {
      expect(adapterMock.search).toHaveBeenNthCalledWith(2, 'netease', 'first', 50, 2)
    })

    const secondRequest = store.search('second')
    await secondRequest

    secondPage.resolve({
      list: [createSearchSong('stale-song')],
      total: 2
    })

    await expect(firstRequest).resolves.toBeUndefined()
    expect(store.results).toHaveLength(1)
    expect(store.results[0].id).toBe('second-song')
    expect(store.keyword).toBe('second')
  })

  it('treats superseded search failures as cancellation and keeps latest state', async () => {
    const first = createDeferred<{ list: Song[]; total: number }>()
    const second = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockImplementation((_platform: string, keyword: string) => {
      if (keyword === 'first') return first.promise
      if (keyword === 'second') return second.promise
      throw new Error(`Unexpected keyword: ${keyword}`)
    })

    const store = useSearchStore()
    const firstRequest = store.search('first')
    const secondRequest = store.search('second')

    second.resolve({
      list: [
        {
          id: 'second-song',
          name: 'Second',
          artists: [{ id: 1, name: 'Artist B' }],
          album: { id: 2, name: 'Album B', picUrl: 'b.jpg' },
          duration: 180000,
          mvid: 0,
          platform: 'netease',
          originalId: 'second-song'
        }
      ],
      total: 1
    })

    await secondRequest

    first.reject(new Error('stale search failed'))

    await expect(firstRequest).resolves.toBeUndefined()
    expect(store.keyword).toBe('second')
    expect(store.results).toHaveLength(1)
    expect(store.results[0].id).toBe('second-song')
    expect(store.error).toBeNull()
    expect(store.isLoading).toBe(false)
  })

  it('plays search results through playSongWithDetails after building the playlist', async () => {
    const searchStore = useSearchStore()
    const playerStore = usePlayerStore()
    const playSongWithDetails = vi
      .spyOn(playerStore, 'playSongWithDetails')
      .mockResolvedValue(undefined as never)

    searchStore.results = [
      {
        id: 'qq-song-mid',
        name: 'Track',
        artist: 'Singer',
        album: 'Album',
        pic: 'cover-a',
        cover: 'cover-b',
        url: null,
        platform: 'qq',
        duration: 215,
        mediaId: 'media-mid'
      }
    ]

    await searchStore.playResult(0)

    expect(playerStore.songList).toHaveLength(1)
    expect((playerStore.songList[0] as Song & { mediaId?: string }).mediaId).toBe('media-mid')
    expect(playSongWithDetails).toHaveBeenCalledWith(0)
  })

  it('clears loading state when canceling an in-flight search via clearResults', async () => {
    const searchDeferred = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockReturnValue(searchDeferred.promise)

    const store = useSearchStore()
    const searchPromise = store.search('test')

    expect(store.isLoading).toBe(true)

    store.clearResults()

    expect(store.isLoading).toBe(false)
    expect(store.results).toHaveLength(0)
    expect(store.keyword).toBe('')
    expect(store.error).toBeNull()

    searchDeferred.resolve({
      list: [
        {
          id: 'test-song',
          name: 'Test',
          artists: [{ id: 1, name: 'Artist' }],
          album: { id: 1, name: 'Album', picUrl: 'test.jpg' },
          duration: 180000,
          mvid: 0,
          platform: 'netease',
          originalId: 'test-song'
        }
      ],
      total: 1
    })

    await searchPromise

    expect(store.results).toHaveLength(0)
    expect(store.isLoading).toBe(false)
  })
})
