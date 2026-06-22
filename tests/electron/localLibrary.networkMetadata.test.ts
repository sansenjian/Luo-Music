import { describe, expect, it } from 'vitest'

import type { LocalLibraryTrack } from '@shared/types/localLibrary'
import { scoreNetworkMetadataCandidate } from '../../electron/local-library/networkMetadata'

function createTrack(overrides: Partial<LocalLibraryTrack> = {}): LocalLibraryTrack {
  const id = overrides.id ?? 'local:track'
  const title = overrides.title ?? 'Starligt'
  const artist = overrides.artist ?? 'Same Artist'
  const album = overrides.album ?? 'Folder Album'
  const duration = overrides.duration ?? 180000
  const filePath = overrides.filePath ?? `D:\\Music\\${id}.mp3`

  return {
    id,
    folderId: 'folder-1',
    filePath,
    fileName: filePath.split(/[\\/]/).pop() ?? 'song.mp3',
    title,
    artist,
    album,
    duration,
    fileSize: 1024,
    modifiedAt: 1,
    coverHash: null,
    metadataSources: {
      title: 'filename',
      artist: 'filename',
      album: 'folder',
      duration: 'unknown',
      cover: 'unknown',
      technical: 'unknown'
    },
    song: {
      id,
      name: title,
      artists: [{ id: 'artist-1', name: artist }],
      album: { id: 'album-1', name: album, picUrl: '' },
      duration,
      mvid: 0,
      platform: 'local',
      originalId: id
    },
    ...overrides
  }
}

describe('local library network metadata scoring', () => {
  it('scores matched online metadata and proposes weak local field updates', () => {
    const result = scoreNetworkMetadataCandidate(createTrack(), {
      provider: 'qq',
      title: 'Starlight',
      artist: 'Same Artist',
      album: 'Tagged Album',
      duration: 180500,
      coverUrl: 'https://img.example.test/cover.jpg'
    })

    expect(result).toMatchObject({
      provider: 'qq',
      confidence: expect.any(Number),
      matchScore: expect.any(Number)
    })
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    expect(result.reasons).toEqual(expect.arrayContaining(['metadata-text-strong-match']))
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title', suggestedValue: 'Starlight' }),
        expect.objectContaining({ field: 'album', suggestedValue: 'Tagged Album' }),
        expect.objectContaining({ field: 'duration', suggestedValue: '180500' }),
        expect.objectContaining({
          field: 'cover',
          suggestedValue: 'https://img.example.test/cover.jpg'
        })
      ])
    )
  })

  it('does not propose overwriting embedded local metadata', () => {
    const result = scoreNetworkMetadataCandidate(
      createTrack({
        title: 'Embedded Title',
        artist: 'Embedded Artist',
        album: 'Embedded Album',
        coverHash: 'a'.repeat(40),
        metadataSources: {
          title: 'embedded',
          artist: 'embedded',
          album: 'embedded',
          duration: 'embedded',
          cover: 'embedded',
          technical: 'embedded'
        }
      }),
      {
        provider: 'netease',
        title: 'Network Title',
        artist: 'Network Artist',
        album: 'Network Album',
        duration: 200000,
        coverUrl: 'https://img.example.test/network.jpg'
      }
    )

    expect(result.suggestions).toEqual([])
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('lowers confidence when a network candidate lacks minimum identity fields', () => {
    const result = scoreNetworkMetadataCandidate(createTrack(), {
      provider: 'plugin',
      album: 'Tagged Album',
      duration: 180500
    })

    expect(result.provider).toBe('plugin')
    expect(result.confidence).toBeLessThan(0.7)
    expect(result.reasons).toContain('metadata-field-missing')
  })
})
