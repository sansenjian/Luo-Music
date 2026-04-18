import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLocalLibraryQueries } from '@/composables/local-library/useLocalLibraryQueries'
import { CoverCacheManager } from '@/utils/cache/coverCache'

describe('useLocalLibraryQueries', () => {
  beforeEach(() => {
    CoverCacheManager.clear()
  })

  it('deduplicates concurrent cover fetches for the same cover hash', async () => {
    const coverRequest = createDeferred<string | null>()
    const platformService = {
      getLocalLibraryAlbums: vi.fn(),
      getLocalLibraryArtists: vi.fn(),
      getLocalLibraryCover: vi.fn(() => coverRequest.promise),
      getLocalLibraryState: vi.fn(),
      getLocalLibraryTracks: vi.fn(() =>
        Promise.resolve({
          items: [
            {
              id: 'track-1',
              folderId: 'folder-1',
              filePath: 'D:\\Music\\one.mp3',
              fileName: 'one.mp3',
              title: 'Song',
              artist: 'Artist',
              album: 'Album',
              duration: 1000,
              fileSize: 1,
              modifiedAt: 1,
              coverHash: 'a'.repeat(40),
              song: {
                id: 'track-1',
                name: 'Song',
                artists: [{ id: 'artist-1', name: 'Artist' }],
                album: { id: 'album-1', name: 'Album', picUrl: '' },
                duration: 1000,
                mvid: 0,
                platform: 'local',
                originalId: 'track-1'
              }
            }
          ],
          nextCursor: null,
          total: 1,
          limit: 60
        })
      ),
      on: vi.fn(),
      pickLocalLibraryFolder: vi.fn(),
      removeLocalLibraryFolder: vi.fn(),
      scanLocalLibrary: vi.fn(),
      setLocalLibraryFolderEnabled: vi.fn()
    }

    const { loadTracks } = useLocalLibraryQueries(platformService as never, task => task())

    const firstLoad = loadTracks()
    const secondLoad = loadTracks()

    await Promise.resolve()

    expect(platformService.getLocalLibraryCover).toHaveBeenCalledTimes(1)

    coverRequest.resolve('data:image/png;base64,ZmFrZQ==')

    await Promise.all([firstLoad, secondLoad])
    expect(platformService.getLocalLibraryCover).toHaveBeenCalledTimes(1)
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}
