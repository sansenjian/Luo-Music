import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import { LOCAL_LIBRARY_SONG_ID_PREFIX } from '@/types/localLibrary'

import {
  createFolderId,
  createTrackId,
  LocalLibraryRepository
} from '../../electron/local-library/repository'

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

describe('LocalLibraryRepository', () => {
  it('stores folders and tracks in SQLite and rebuilds the public state shape', async () => {
    const tempDir = await createTempPath('local-library-repository')
    const databasePath = join(tempDir, 'library.db')
    const repository = new LocalLibraryRepository(databasePath)

    const folderPath = join(tempDir, 'Music')
    const folderId = createFolderId(folderPath)

    repository.upsertFolder({
      id: folderId,
      path: folderPath,
      name: 'Music',
      enabled: true,
      createdAt: 100,
      lastScannedAt: null
    })

    repository.replaceFolderTracks(folderId, [
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(folderPath, 'Artist - Song.mp3')),
        folderId,
        filePath: join(folderPath, 'Artist - Song.mp3'),
        fileName: 'Artist - Song.mp3',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 123,
        fileSize: 2048,
        modifiedAt: 456,
        coverHash: 'cover-1',
        song: {
          id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(folderPath, 'Artist - Song.mp3')),
          name: 'Song',
          artists: [{ id: 'artist-1', name: 'Artist' }],
          album: { id: 'album-1', name: 'Album', picUrl: '' },
          duration: 123,
          mvid: 0,
          platform: 'netease',
          originalId: createTrackId(
            LOCAL_LIBRARY_SONG_ID_PREFIX,
            join(folderPath, 'Artist - Song.mp3')
          ),
          url: 'luo-media://media?path=D%3A%5CMusic%5CArtist%20-%20Song.mp3',
          extra: {
            localSource: true
          }
        }
      }
    ])
    repository.updateFolderLastScannedAt(folderId, 999)

    const folders = repository.listFolders()
    const tracks = repository.listTracks()

    expect(folders).toEqual([
      {
        id: folderId,
        path: folderPath,
        name: 'Music',
        enabled: true,
        createdAt: 100,
        lastScannedAt: 999,
        songCount: 1
      }
    ])
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({
      folderId,
      fileName: 'Artist - Song.mp3',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      coverHash: 'cover-1',
      duration: 123
    })
    expect(tracks[0].song.extra).toMatchObject({
      localSource: true,
      localFilePath: join(folderPath, 'Artist - Song.mp3')
    })
    expect(tracks[0].song.url).toContain('luo-media://media?path=')

    repository.close()
  })

  it('removes tracks automatically when their folder is deleted', async () => {
    const tempDir = await createTempPath('local-library-repository-cascade')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Music')
    const folderId = createFolderId(folderPath)

    repository.upsertFolder({
      id: folderId,
      path: folderPath,
      name: 'Music',
      enabled: true,
      createdAt: 1,
      lastScannedAt: null
    })
    repository.replaceFolderTracks(folderId, [
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(folderPath, 'Track.mp3')),
        folderId,
        filePath: join(folderPath, 'Track.mp3'),
        fileName: 'Track.mp3',
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        duration: 0,
        fileSize: 1,
        modifiedAt: 1,
        coverHash: null,
        song: {
          id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(folderPath, 'Track.mp3')),
          name: 'Track',
          artists: [{ id: 'artist-1', name: 'Artist' }],
          album: { id: 'album-1', name: 'Album', picUrl: '' },
          duration: 0,
          mvid: 0,
          platform: 'netease',
          originalId: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(folderPath, 'Track.mp3')),
          url: 'luo-media://media?path=D%3A%5CMusic%5CTrack.mp3',
          extra: {
            localSource: true
          }
        }
      }
    ])

    repository.removeFolder(folderId)

    expect(repository.listFolders()).toEqual([])
    expect(repository.listTracks()).toEqual([])

    repository.close()
  })

  it('supports paged track, artist, and album queries for enabled folders only', async () => {
    const tempDir = await createTempPath('local-library-repository-page')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const enabledFolderPath = join(tempDir, 'Enabled')
    const disabledFolderPath = join(tempDir, 'Disabled')
    const enabledFolderId = createFolderId(enabledFolderPath)
    const disabledFolderId = createFolderId(disabledFolderPath)

    repository.upsertFolder({
      id: enabledFolderId,
      path: enabledFolderPath,
      name: 'Enabled',
      enabled: true,
      createdAt: 1,
      lastScannedAt: null
    })
    repository.upsertFolder({
      id: disabledFolderId,
      path: disabledFolderPath,
      name: 'Disabled',
      enabled: false,
      createdAt: 2,
      lastScannedAt: null
    })

    repository.replaceFolderTracks(enabledFolderId, [
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(enabledFolderPath, 'Alpha.mp3')),
        folderId: enabledFolderId,
        filePath: join(enabledFolderPath, 'Alpha.mp3'),
        fileName: 'Alpha.mp3',
        title: 'Alpha',
        artist: 'Artist A',
        album: 'Album A',
        duration: 60000,
        fileSize: 1,
        modifiedAt: 1,
        coverHash: 'cover-a',
        song: {
          id: 'alpha',
          name: 'Alpha',
          artists: [{ id: 'artist-a', name: 'Artist A' }],
          album: { id: 'album-a', name: 'Album A', picUrl: '' },
          duration: 60000,
          mvid: 0,
          platform: 'netease',
          originalId: 'alpha',
          url: 'luo-media://media?path=alpha',
          extra: {
            localSource: true
          }
        }
      },
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(enabledFolderPath, 'Beta.mp3')),
        folderId: enabledFolderId,
        filePath: join(enabledFolderPath, 'Beta.mp3'),
        fileName: 'Beta.mp3',
        title: 'Beta',
        artist: 'Artist B',
        album: 'Album B',
        duration: 120000,
        fileSize: 2,
        modifiedAt: 2,
        coverHash: 'cover-b',
        song: {
          id: 'beta',
          name: 'Beta',
          artists: [{ id: 'artist-b', name: 'Artist B' }],
          album: { id: 'album-b', name: 'Album B', picUrl: '' },
          duration: 120000,
          mvid: 0,
          platform: 'netease',
          originalId: 'beta',
          url: 'luo-media://media?path=beta',
          extra: {
            localSource: true
          }
        }
      }
    ])
    repository.replaceFolderTracks(disabledFolderId, [
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, join(disabledFolderPath, 'Hidden.mp3')),
        folderId: disabledFolderId,
        filePath: join(disabledFolderPath, 'Hidden.mp3'),
        fileName: 'Hidden.mp3',
        title: 'Hidden',
        artist: 'Artist Hidden',
        album: 'Album Hidden',
        duration: 30000,
        fileSize: 3,
        modifiedAt: 3,
        coverHash: 'cover-hidden',
        song: {
          id: 'hidden',
          name: 'Hidden',
          artists: [{ id: 'artist-hidden', name: 'Artist Hidden' }],
          album: { id: 'album-hidden', name: 'Album Hidden', picUrl: '' },
          duration: 30000,
          mvid: 0,
          platform: 'netease',
          originalId: 'hidden',
          url: 'luo-media://media?path=hidden',
          extra: {
            localSource: true
          }
        }
      }
    ])

    const firstTrackPage = repository.getTracksPage({ limit: 1 })
    const secondTrackPage = repository.getTracksPage({
      limit: 1,
      cursor: firstTrackPage.nextCursor
    })
    const artistPage = repository.getArtistsPage()
    const albumPage = repository.getAlbumsPage()

    expect(firstTrackPage.total).toBe(2)
    expect(firstTrackPage.items).toHaveLength(1)
    expect(secondTrackPage.items).toHaveLength(1)
    expect(firstTrackPage.items[0]?.title).toBe('Alpha')
    expect(secondTrackPage.items[0]?.title).toBe('Beta')
    expect(repository.getTrackCount()).toBe(2)
    expect(artistPage.items.map(item => item.name)).toEqual(['Artist A', 'Artist B'])
    expect(albumPage.items.map(item => `${item.artist}:${item.name}`)).toEqual([
      'Artist A:Album A',
      'Artist B:Album B'
    ])

    repository.close()
  })

  it('can toggle folder enablement and delete tracks by file path', async () => {
    const tempDir = await createTempPath('local-library-repository-toggle')
    const repository = new LocalLibraryRepository(join(tempDir, 'library.db'))
    const folderPath = join(tempDir, 'Toggle')
    const folderId = createFolderId(folderPath)
    const filePath = join(folderPath, 'Toggle.mp3')

    repository.upsertFolder({
      id: folderId,
      path: folderPath,
      name: 'Toggle',
      enabled: true,
      createdAt: 1,
      lastScannedAt: null
    })
    repository.upsertTracks([
      {
        id: createTrackId(LOCAL_LIBRARY_SONG_ID_PREFIX, filePath),
        folderId,
        filePath,
        fileName: 'Toggle.mp3',
        title: 'Toggle',
        artist: 'Artist',
        album: 'Album',
        duration: 0,
        fileSize: 1,
        modifiedAt: 1,
        coverHash: null,
        song: {
          id: 'toggle',
          name: 'Toggle',
          artists: [{ id: 'artist', name: 'Artist' }],
          album: { id: 'album', name: 'Album', picUrl: '' },
          duration: 0,
          mvid: 0,
          platform: 'netease',
          originalId: 'toggle',
          url: 'luo-media://media?path=toggle',
          extra: {
            localSource: true
          }
        }
      }
    ])

    repository.setFolderEnabled(folderId, false)
    expect(repository.getTrackCount()).toBe(0)

    repository.setFolderEnabled(folderId, true)
    expect(repository.deleteTracksByFilePaths([filePath])).toBe(1)
    expect(repository.listTracks()).toEqual([])

    repository.close()
  })

  it('migrates legacy databases before preparing cover hash queries', async () => {
    const tempDir = await createTempPath('local-library-repository-legacy')
    const databasePath = join(tempDir, 'library.db')
    const legacyDatabase = new DatabaseSync(databasePath)

    legacyDatabase.exec(`
      CREATE TABLE local_library_folders (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        path_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_scanned_at INTEGER
      );

      CREATE TABLE local_library_tracks (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_path_key TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        file_size INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        FOREIGN KEY (folder_id) REFERENCES local_library_folders(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_local_library_tracks_folder_id
        ON local_library_tracks(folder_id);
      CREATE INDEX idx_local_library_tracks_title
        ON local_library_tracks(title);
      CREATE INDEX idx_local_library_tracks_artist
        ON local_library_tracks(artist);
      CREATE INDEX idx_local_library_tracks_album
        ON local_library_tracks(album);
    `)
    legacyDatabase.close()

    const repository = new LocalLibraryRepository(databasePath)
    expect(repository.listTracks()).toEqual([])
    repository.close()

    const migratedDatabase = new DatabaseSync(databasePath)
    const columns = migratedDatabase
      .prepare('PRAGMA table_info(local_library_tracks)')
      .all() as Array<{ name: string }>
    const indexes = migratedDatabase
      .prepare('PRAGMA index_list(local_library_tracks)')
      .all() as Array<{ name: string }>

    expect(columns.map(column => column.name)).toContain('cover_hash')
    expect(indexes.map(index => index.name)).toContain('idx_local_library_tracks_cover_hash')

    migratedDatabase.close()
  })
})
