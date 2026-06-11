import { describe, expect, it } from 'vitest'

import type { LocalLibraryTrack } from '@shared/types/localLibrary'
import {
  buildStrictDuplicateIndex,
  canStrictMergeTracks
} from '../../electron/local-library/duplicates'

function createTrack(overrides: Partial<LocalLibraryTrack> = {}): LocalLibraryTrack {
  const id = overrides.id ?? `local:${Math.random().toString(16).slice(2)}`
  const title = overrides.title ?? 'Same Song'
  const artist = overrides.artist ?? 'Same Artist'
  const album = overrides.album ?? 'Album'
  const filePath = overrides.filePath ?? `D:\\Music\\${id}.mp3`

  return {
    id,
    folderId: 'folder-1',
    filePath,
    fileName: filePath.split(/[\\/]/).pop() ?? 'song.mp3',
    title,
    artist,
    album,
    duration: 180000,
    fileSize: 1024,
    modifiedAt: 1,
    coverHash: null,
    song: {
      id,
      name: title,
      artists: [{ id: 'artist-1', name: artist }],
      album: { id: 'album-1', name: album, picUrl: '' },
      duration: overrides.duration ?? 180000,
      mvid: 0,
      platform: 'local',
      originalId: id
    },
    ...overrides
  }
}

describe('local library duplicate index', () => {
  it('groups strict metadata duplicates and keeps the highest quality member visible', () => {
    const flacTrack = createTrack({
      id: 'local:flac',
      filePath: 'D:\\Music\\Artist - Same Song.flac',
      codec: 'FLAC',
      sampleRate: 96000,
      bitDepth: 24,
      bitrate: 1800000,
      fileSize: 20_000_000,
      coverHash: 'a'.repeat(40)
    })
    const mp3Track = createTrack({
      id: 'local:mp3',
      filePath: 'D:\\Music\\Artist - Same Song.mp3',
      codec: 'MP3',
      sampleRate: 44100,
      bitrate: 320000,
      fileSize: 8_000_000
    })

    const groups = buildStrictDuplicateIndex([mp3Track, flacTrack])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      representativeTrackId: 'local:flac',
      trackCount: 2,
      hiddenCount: 1
    })
    expect(groups[0]?.members).toEqual([
      expect.objectContaining({
        trackId: 'local:flac',
        rank: 1,
        hidden: false
      }),
      expect.objectContaining({
        trackId: 'local:mp3',
        rank: 2,
        hidden: true
      })
    ])
  })

  it('normalizes source prefixes but rejects duration and version mismatches', () => {
    expect(
      canStrictMergeTracks(
        createTrack({ id: 'local:source-a', title: '[转载] Same Song' }),
        createTrack({ id: 'local:source-b', title: 'Same Song', duration: 181500 })
      )
    ).toBe(true)

    expect(
      canStrictMergeTracks(
        createTrack({ id: 'local:duration-a', duration: 180000 }),
        createTrack({ id: 'local:duration-b', duration: 183001 })
      )
    ).toBe(false)

    expect(
      canStrictMergeTracks(
        createTrack({ id: 'local:version-a', title: 'Same Song Live' }),
        createTrack({ id: 'local:version-b', title: 'Same Song Remix' })
      )
    ).toBe(false)
  })
})
