import { describe, expect, it, vi } from 'vitest'

import { migrateLegacyLocalLibraryStateIfNeeded } from '../../electron/local-library/migration'

describe('localLibrary migration', () => {
  it('wraps the legacy folder and track import inside a repository transaction', () => {
    const upsertFolder = vi.fn()
    const replaceFolderTracks = vi.fn()
    const runInTransaction = vi.fn((task: () => void) => task())

    const repository = {
      hasAnyFolder: vi.fn(() => false),
      upsertFolder,
      replaceFolderTracks,
      runInTransaction
    }

    migrateLegacyLocalLibraryStateIfNeeded(
      repository as never,
      {
        get: <T>() =>
          ({
            folders: [
              {
                id: `local-folder:${'a'.repeat(40)}`,
                path: 'D:\\Music',
                name: 'Music',
                enabled: true,
                createdAt: 1,
                lastScannedAt: 2
              }
            ],
            tracks: [
              {
                id: 'local:track-1',
                folderId: `local-folder:${'a'.repeat(40)}`,
                filePath: 'D:\\Music\\song.mp3',
                fileName: 'song.mp3',
                title: 'Song',
                artist: 'Artist',
                album: 'Album',
                duration: 123000,
                fileSize: 42,
                modifiedAt: 1,
                song: {
                  id: 'local:track-1',
                  name: 'Song',
                  artists: [{ id: 'artist-1', name: 'Artist' }],
                  album: { id: 'album-1', name: 'Album', picUrl: '' },
                  duration: 123000,
                  mvid: 0,
                  platform: 'local',
                  originalId: 'local:track-1',
                  url: 'luo-media://media?path=song.mp3',
                  extra: {
                    localSource: true,
                    localDurationKnown: true
                  }
                }
              }
            ]
          }) as T
      },
      'localLibraryState'
    )

    expect(runInTransaction).toHaveBeenCalledTimes(1)
    expect(upsertFolder).toHaveBeenCalledTimes(1)
    expect(replaceFolderTracks).toHaveBeenCalledTimes(1)
  })
})
