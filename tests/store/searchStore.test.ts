import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetServices } from '../../src/services/registry'
import { setupServices } from '../../src/services'
import type { Song } from '../../src/platform/music/interface'
import { usePlayerStore } from '../../src/store/playerStore'
import { searchResultItemToSong, useSearchStore } from '../../src/store/searchStore'

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

const adapterMock = {
  search: vi.fn()
}

vi.mock('../../src/platform/music', () => ({
  getMusicAdapter: vi.fn(() => adapterMock)
}))

describe('searchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

  it('ignores stale search responses and keeps the latest results', async () => {
    const first = createDeferred<{ list: Song[]; total: number }>()
    const second = createDeferred<{ list: Song[]; total: number }>()

    adapterMock.search.mockImplementation((keyword: string) => {
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
})
