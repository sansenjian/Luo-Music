import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_LIBRARY_SONG_ID_PREFIX } from '@shared/types/localLibrary'

import { createFolderId, createTrackId } from '../../electron/local-library/repository.helpers'
import { LocalLibraryRepository } from '../../electron/local-library/repository'
import { LocalLibraryService } from '../../electron/local-library/service'

const createdPaths: string[] = []

async function createTempPath(name: string): Promise<string> {
  const directoryPath = await mkdtemp(join(tmpdir(), `${name}-`))
  createdPaths.push(directoryPath)
  return directoryPath
}

afterEach(async () => {
  vi.useRealTimers()

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

function createNoopWatcherFactory() {
  return () => createWatcherHarness().watcher as never
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

    const service = new LocalLibraryService(
      repository,
      legacyStore,
      undefined,
      createNoopWatcherFactory()
    )
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

    await service.dispose()
  })

  it('scans the filesystem and persists tracks through the repository', async () => {
    const tempDir = await createTempPath('local-library-service-scan')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    await mkdir(folderPath, { recursive: true })
    await writeFile(join(folderPath, 'Artist - First Song.mp3'), '')
    await writeFile(join(folderPath, 'Second Song.flac'), '')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      undefined,
      createNoopWatcherFactory()
    )

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
    expect(state.status.scanJobKind).toBe('folder')
    expect(state.status.scanJobId).toBe(state.latestScanJob?.id)
    expect(state.latestScanJob).toMatchObject({
      kind: 'folder',
      phase: 'completed',
      folderCount: 1,
      scannedFolders: 1,
      scannedFiles: 2,
      discoveredTracks: 2,
      errorMessage: null
    })

    await service.dispose()
  })

  it('rescans a single registered folder and resolves registered paths for native actions', async () => {
    const tempDir = await createTempPath('local-library-service-single-folder-scan')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const firstFolderPath = join(tempDir, 'Music')
    const secondFolderPath = join(tempDir, 'Other')
    const firstTrackPath = join(firstFolderPath, 'Artist A - First Song.mp3')
    const secondTrackPath = join(secondFolderPath, 'Artist B - Second Song.mp3')
    const addedFirstFolderTrackPath = join(firstFolderPath, 'Artist A - Added Song.mp3')
    const unsyncedSecondFolderTrackPath = join(secondFolderPath, 'Artist B - Unsynced Song.mp3')
    await mkdir(firstFolderPath, { recursive: true })
    await mkdir(secondFolderPath, { recursive: true })
    await writeFile(firstTrackPath, '')
    await writeFile(secondTrackPath, '')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      undefined,
      createNoopWatcherFactory()
    )

    await service.addFolder(firstFolderPath)
    await service.addFolder(secondFolderPath)
    await writeFile(addedFirstFolderTrackPath, '')
    await writeFile(unsyncedSecondFolderTrackPath, '')

    const firstFolderId = createFolderId(firstFolderPath)
    const addedTrackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, addedFirstFolderTrackPath)
    const nextState = await service.scanFolder(firstFolderId)
    const trackPage = await service.getTracksPage({ limit: 10 })

    expect(nextState.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstFolderId,
          songCount: 2
        }),
        expect.objectContaining({
          id: createFolderId(secondFolderPath),
          songCount: 1
        })
      ])
    )
    expect(trackPage.total).toBe(3)
    expect(trackPage.items.map(track => track.filePath)).toContain(addedFirstFolderTrackPath)
    expect(trackPage.items.map(track => track.filePath)).not.toContain(
      unsyncedSecondFolderTrackPath
    )
    expect(service.getFolderPath(firstFolderId)).toBe(firstFolderPath)
    expect(service.getTrackFilePath(addedTrackId)).toBe(addedFirstFolderTrackPath)

    await service.setFolderEnabled(firstFolderId, false)
    await expect(service.scanFolder(firstFolderId)).rejects.toThrow('请先启用该本地音乐文件夹')

    await service.dispose()
  })

  it('skips nested folders that would rescan files from an existing local library folder', async () => {
    const tempDir = await createTempPath('local-library-service-overlap')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const nestedFolderPath = join(folderPath, 'Nested')
    await mkdir(nestedFolderPath, { recursive: true })
    await writeFile(join(nestedFolderPath, 'Nested Song.mp3'), '')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      undefined,
      createNoopWatcherFactory()
    )

    await service.addFolder(folderPath)
    const nextState = await service.addFolder(nestedFolderPath)

    expect(nextState.folders).toHaveLength(1)
    expect(nextState.folders[0]?.path).toBe(folderPath)
    expect(nextState.status.message).toBe('该文件夹与已有本地音乐文件夹重叠')

    await service.dispose()
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
      }),
      createNoopWatcherFactory()
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

    await service.dispose()
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
      metadataReader,
      createNoopWatcherFactory()
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

    await service.dispose()
  })

  it('watches folders and debounces automatic rescans after local file changes', async () => {
    vi.useFakeTimers()
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

    await vi.advanceTimersByTimeAsync(1700)
    await vi.waitFor(() => {
      expect(metadataReader).toHaveBeenCalledTimes(2)
    })

    expect((await service.getTracksPage()).items[0]).toMatchObject({
      title: 'Watcher Song Updated',
      duration: 2000
    })

    await service.dispose()
  })

  it('toggles folder enablement and exposes artist and album pages', async () => {
    const tempDir = await createTempPath('local-library-service-pages')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    await mkdir(folderPath, { recursive: true })
    await writeFile(join(folderPath, 'Artist A - First Song.mp3'), '')
    await writeFile(join(folderPath, 'Artist B - Second Song.mp3'), '')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      undefined,
      createNoopWatcherFactory()
    )

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

    await service.dispose()
  })

  it('repairs previously scanned ogg tracks with unknown duration when tracks are listed', async () => {
    const tempDir = await createTempPath('local-library-service-repair-ogg')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Unknown Duration.ogg')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, 'ogg-data')
    const trackStats = await stat(trackPath)

    const folderId = createFolderId(folderPath)
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, trackPath)

    repository.upsertFolder({
      id: folderId,
      path: folderPath,
      name: 'Music',
      enabled: true,
      createdAt: Date.now(),
      lastScannedAt: Date.now()
    })
    repository.upsertTracks([
      {
        id: trackId,
        folderId,
        filePath: trackPath,
        fileName: 'Unknown Duration.ogg',
        title: 'Unknown Duration',
        artist: 'Artist',
        album: 'Album',
        duration: 0,
        fileSize: trackStats.size,
        modifiedAt: Math.round(trackStats.mtimeMs),
        coverHash: null,
        song: {
          id: trackId,
          name: 'Unknown Duration',
          artists: [{ id: 'artist-1', name: 'Artist' }],
          album: { id: 'album-1', name: 'Album', picUrl: '' },
          duration: 0,
          mvid: 0,
          platform: 'local',
          originalId: trackId,
          url: 'luo-media://media?path=unknown.ogg',
          extra: {
            localSource: true,
            localDurationKnown: false
          }
        }
      }
    ])

    const metadataReader = vi.fn(async () => ({
      title: 'Unknown Duration',
      artist: 'Artist',
      album: 'Album',
      duration: 189000
    }))

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      metadataReader,
      createNoopWatcherFactory()
    )

    const firstPage = await service.getTracksPage()
    expect(firstPage.items[0]?.duration).toBe(0)

    await vi.waitFor(() => {
      expect(metadataReader).toHaveBeenCalledWith(trackPath, { skipCover: undefined })
      return service.getTracksPage().then(repairedPage => {
        expect(repairedPage.items[0]?.duration).toBe(189000)
        expect(repairedPage.items[0]?.song.duration).toBe(189000)
      })
    })

    await service.dispose()
  })

  it('indexes strict duplicate tracks and filters hidden duplicate members', async () => {
    const tempDir = await createTempPath('local-library-service-duplicates')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const flacPath = join(folderPath, 'Artist - Same Song.flac')
    const mp3Path = join(folderPath, 'Artist - Same Song.mp3')
    await mkdir(folderPath, { recursive: true })
    await writeFile(flacPath, 'flac-data')
    await writeFile(mp3Path, 'mp3-data')

    const service = new LocalLibraryService(
      repository,
      {
        get: <T>() => undefined as T
      },
      async filePath => ({
        title: 'Same Song',
        artist: 'Artist',
        album: 'Album',
        duration: filePath === flacPath ? 180000 : 181000,
        codec: filePath === flacPath ? 'FLAC' : 'MP3',
        sampleRate: filePath === flacPath ? 96000 : 44100,
        bitDepth: filePath === flacPath ? 24 : null,
        bitrate: filePath === flacPath ? 1800000 : 320000
      }),
      createNoopWatcherFactory()
    )

    await service.addFolder(folderPath)

    const allTracks = await service.getTracksPage()
    const visibleTracks = await service.getTracksPage({ hideDuplicates: true })
    const duplicateTracks = await service.getTracksPage({ showDuplicatesOnly: true })

    expect(allTracks.total).toBe(2)
    expect(visibleTracks.total).toBe(1)
    expect(visibleTracks.items[0]).toMatchObject({
      codec: 'FLAC',
      duplicateHidden: false,
      duplicateRank: 1
    })
    expect(duplicateTracks.total).toBe(2)
    expect(duplicateTracks.items.map(track => track.duplicateGroupId)).toEqual([
      expect.stringMatching(/^local-duplicate:/),
      expect.stringMatching(/^local-duplicate:/)
    ])

    await service.dispose()
  })
})
