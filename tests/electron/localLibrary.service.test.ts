import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_LIBRARY_SONG_ID_PREFIX } from '@/types/localLibrary'

import {
  createFolderId,
  createTrackId,
  LocalLibraryRepository
} from '../../electron/local-library/repository'
import { LocalLibraryService } from '../../electron/local-library/service'

const createdPaths: string[] = []

async function createTempPath(name: string): Promise<string> {
  const directoryPath = await mkdtemp(join(tmpdir(), `${name}-`))
  createdPaths.push(directoryPath)
  return directoryPath
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const targetPath = createdPaths.pop()
    if (!targetPath) {
      continue
    }

    await rm(targetPath, { recursive: true, force: true })
  }
})

function createWatcherHarness() {
  const listeners = new Map<string, Array<(filePath: string) => void>>()
  const watcher = {
    on: vi.fn((event: string, listener: (filePath: string) => void) => {
      const eventListeners = listeners.get(event) ?? []
      eventListeners.push(listener)
      listeners.set(event, eventListeners)
      return watcher
    }),
    close: vi.fn().mockResolvedValue(undefined)
  }

  return {
    watcher,
    emit(event: string, filePath: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener(filePath)
      }
    }
  }
}

describe('LocalLibraryService', () => {
  it('migrates the legacy electron-store payload into the SQLite repository', async () => {
    const tempDir = await createTempPath('local-library-service-migrate')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const folderId = createFolderId(folderPath)
    const trackPath = join(folderPath, 'Artist - Song.mp3')
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, trackPath)

    const legacyStore = {
      get: <T>() =>
        ({
          folders: [
            {
              id: folderId,
              path: folderPath,
              name: 'Music',
              enabled: true,
              createdAt: 111,
              lastScannedAt: 222
            }
          ],
          tracks: [
            {
              id: trackId,
              folderId,
              filePath: trackPath,
              fileName: 'Artist - Song.mp3',
              title: 'Song',
              artist: 'Artist',
              album: 'Album',
              duration: 0,
              fileSize: 12,
              modifiedAt: 333,
              song: {
                id: trackId,
                name: 'Song',
                artists: [{ id: 'artist-1', name: 'Artist' }],
                album: { id: 'album-1', name: 'Album', picUrl: '' },
                duration: 0,
                mvid: 0,
                platform: 'netease',
                originalId: trackId,
                url: 'file:///Artist%20-%20Song.mp3',
                extra: {
                  localSource: true
                }
              }
            }
          ]
        }) as T
    }

    const service = new LocalLibraryService(repository, legacyStore)
    const state = service.getState()

    expect(state.folders).toHaveLength(1)
    expect(state.folders[0]).toMatchObject({
      id: folderId,
      path: folderPath,
      lastScannedAt: 222,
      songCount: 1
    })
    const trackPage = await service.getTracksPage()
    expect(trackPage.items).toHaveLength(1)
    expect(trackPage.items[0]).toMatchObject({
      id: trackId,
      filePath: trackPath,
      title: 'Song'
    })

    repository.close()
  })

  it('scans the filesystem and persists tracks through the repository', async () => {
    const tempDir = await createTempPath('local-library-service-scan')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    await mkdir(folderPath, { recursive: true })
    await writeFile(join(folderPath, 'Artist - First Song.mp3'), '')
    await writeFile(join(folderPath, 'Second Song.flac'), '')

    const service = new LocalLibraryService(repository, {
      get: <T>() => undefined as T
    })

    await service.addFolder(folderPath)
    const state = service.getState()
    const trackPage = await service.getTracksPage()

    expect(state.folders).toHaveLength(1)
    expect(state.folders[0].songCount).toBe(2)
    expect(state.tracks).toEqual([])
    expect(trackPage.items.map(track => track.title)).toEqual(['First Song', 'Second Song'])
    expect(trackPage.items.map(track => track.artist)).toEqual(['Artist', '未知艺术家'])
    expect(state.status.phase).toBe('idle')
    expect(state.status.discoveredTracks).toBe(2)

    repository.close()
  })

  it('prefers parsed metadata over filename fallbacks when metadata is available', async () => {
    const tempDir = await createTempPath('local-library-service-metadata')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Artist - First Song.mp3')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, '')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      async filePath => ({
        title: filePath === trackPath ? 'Tag Title' : null,
        artist: filePath === trackPath ? 'Tag Artist' : null,
        album: filePath === trackPath ? 'Tag Album' : null,
        duration: filePath === trackPath ? 245000 : null
      })
    )

    await service.addFolder(folderPath)
    const trackPage = await service.getTracksPage()

    expect(trackPage.items).toHaveLength(1)
    expect(trackPage.items[0]).toMatchObject({
      title: 'Tag Title',
      artist: 'Tag Artist',
      album: 'Tag Album',
      duration: 245000
    })
    expect(trackPage.items[0].song).toMatchObject({
      name: 'Tag Title',
      duration: 245000
    })
    expect(trackPage.items[0].song.url).toContain('luo-media://media?path=')

    repository.close()
  })

  it('reuses unchanged tracks during rescan and reparses only changed files', async () => {
    const tempDir = await createTempPath('local-library-service-incremental')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Artist - Incremental Song.mp3')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, 'v1')

    const metadataReader = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Parsed Once',
        artist: 'Parsed Artist',
        album: 'Parsed Album',
        duration: 111000
      })
      .mockResolvedValueOnce({
        title: 'Parsed Twice',
        artist: 'Parsed Artist',
        album: 'Parsed Album',
        duration: 222000
      })

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      metadataReader
    )

    await service.addFolder(folderPath)
    expect(metadataReader).toHaveBeenCalledTimes(1)
    expect((await service.getTracksPage()).items[0]).toMatchObject({
      title: 'Parsed Once',
      duration: 111000
    })

    await service.scan()
    expect(metadataReader).toHaveBeenCalledTimes(1)
    expect((await service.getTracksPage()).items[0]).toMatchObject({
      title: 'Parsed Once',
      duration: 111000
    })

    await writeFile(trackPath, 'v2-updated')
    await service.scan()

    expect(metadataReader).toHaveBeenCalledTimes(2)
    expect((await service.getTracksPage()).items[0]).toMatchObject({
      title: 'Parsed Twice',
      duration: 222000
    })
    expect((await service.getTracksPage()).items[0].song.url).toContain('luo-media://media?path=')

    repository.close()
  })

  it('watches folders and debounces automatic rescans after local file changes', async () => {
    const tempDir = await createTempPath('local-library-service-watch')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Watcher Song.mp3')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, 'watch-v1')

    const watcherHarness = createWatcherHarness()
    const metadataReader = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Watcher Song',
        artist: 'Watcher Artist',
        album: 'Watcher Album',
        duration: 1000
      })
      .mockResolvedValueOnce({
        title: 'Watcher Song Updated',
        artist: 'Watcher Artist',
        album: 'Watcher Album',
        duration: 2000
      })

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      metadataReader,
      () => watcherHarness.watcher as never
    )

    await service.addFolder(folderPath)
    expect(metadataReader).toHaveBeenCalledTimes(1)

    await writeFile(trackPath, 'watch-v2')
    watcherHarness.emit('change', trackPath)
    watcherHarness.emit('change', trackPath)

    await new Promise(resolve => setTimeout(resolve, 1700))

    expect(metadataReader).toHaveBeenCalledTimes(2)
    expect((await service.getTracksPage()).items[0]).toMatchObject({
      title: 'Watcher Song Updated',
      duration: 2000
    })

    service.dispose()
    repository.close()
  })

  it('toggles folder enablement and exposes artist and album pages', async () => {
    const tempDir = await createTempPath('local-library-service-pages')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    await mkdir(folderPath, { recursive: true })
    await writeFile(join(folderPath, 'Artist A - First Song.mp3'), '')
    await writeFile(join(folderPath, 'Artist B - Second Song.mp3'), '')

    const service = new LocalLibraryService(repository, {
      get: <T>() => undefined as T
    })

    await service.addFolder(folderPath)

    const artistPage = await service.getArtistsPage()
    const albumPage = await service.getAlbumsPage()
    expect(artistPage.items.map(item => item.name)).toEqual(['Artist A', 'Artist B'])
    expect(albumPage.total).toBe(2)

    const folderId = service.getState().folders[0]?.id
    expect(folderId).toBeTruthy()

    await service.setFolderEnabled(folderId!, false)
    expect(service.getState().status.message).toContain('停用')
    expect((await service.getTracksPage()).total).toBe(0)

    await service.setFolderEnabled(folderId!, true)
    expect((await service.getTracksPage()).total).toBe(2)

    repository.close()
  })
})
