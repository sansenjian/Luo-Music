import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_LIBRARY_SONG_ID_PREFIX } from '@/types/localLibrary'

import { createFolderId, createTrackId } from '../../electron/local-library/repository'
import { LocalLibraryScanEngine } from '../../electron/local-library/scanEngine'

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

describe('LocalLibraryScanEngine', () => {
  it('reuses unchanged tracks by default', async () => {
    const tempDir = await createTempPath('local-library-scan-engine-cache')
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Unknown Duration.ogg')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, 'ogg-data')
    const trackStats = await stat(trackPath)
    const folderId = createFolderId(folderPath)
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, trackPath)

    const existingTrack = {
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

    const metadataReader = vi.fn().mockResolvedValue({
      title: 'Unknown Duration',
      artist: 'Artist',
      album: 'Album',
      duration: 189000
    })

    const scanEngine = new LocalLibraryScanEngine({
      coverManager: {
        saveEmbeddedCover: vi.fn()
      } as never,
      isDisposed: () => false,
      metadataReader,
      repository: {
        findTrackByFilePath: vi.fn().mockReturnValue(existingTrack)
      } as never
    })

    const track = await scanEngine.scanSingleFile(
      {
        id: folderId,
        path: folderPath,
        name: 'Music',
        enabled: true,
        createdAt: Date.now(),
        lastScannedAt: Date.now()
      },
      trackPath
    )

    expect(track).toBe(existingTrack)
    expect(metadataReader).not.toHaveBeenCalled()
  })

  it('forces metadata refresh for unchanged ogg tracks when requested', async () => {
    const tempDir = await createTempPath('local-library-scan-engine-force-refresh')
    const folderPath = join(tempDir, 'Music')
    const trackPath = join(folderPath, 'Unknown Duration.ogg')
    await mkdir(folderPath, { recursive: true })
    await writeFile(trackPath, 'ogg-data')
    const trackStats = await stat(trackPath)
    const folderId = createFolderId(folderPath)
    const trackId = createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, trackPath)

    const existingTrack = {
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

    const metadataReader = vi.fn().mockResolvedValue({
      title: 'Unknown Duration',
      artist: 'Artist',
      album: 'Album',
      duration: 189000
    })

    const scanEngine = new LocalLibraryScanEngine({
      coverManager: {
        saveEmbeddedCover: vi.fn()
      } as never,
      isDisposed: () => false,
      metadataReader,
      repository: {
        findTrackByFilePath: vi.fn().mockReturnValue(existingTrack)
      } as never
    })

    const track = await scanEngine.scanSingleFile(
      {
        id: folderId,
        path: folderPath,
        name: 'Music',
        enabled: true,
        createdAt: Date.now(),
        lastScannedAt: Date.now()
      },
      trackPath,
      {
        forceMetadataRefresh: true
      }
    )

    expect(metadataReader).toHaveBeenCalledWith(trackPath)
    expect(track).toMatchObject({
      duration: 189000,
      title: 'Unknown Duration',
      artist: 'Artist',
      album: 'Album'
    })
    expect(track?.song.duration).toBe(189000)
    expect(track?.song.extra).toMatchObject({
      localDurationKnown: true,
      localSource: true
    })
  })
})
