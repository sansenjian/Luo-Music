import { describe, expect, it } from 'vitest'

import {
  mapFolderListRow,
  mapTrackRow,
  toAlbumSummary,
  toArtistSummary
} from '../../electron/local-library/repository.mappers'
import { createAlbumId, createArtistId } from '../../electron/local-library/repository.helpers'

describe('localLibrary repository mappers', () => {
  it('splits slash-delimited artist credits into multiple song artists', () => {
    const track = mapTrackRow({
      id: 'local:track-1',
      folder_id: 'folder-1',
      file_path: 'D:\\Music\\sample.mp3',
      file_name: 'sample.mp3',
      title: 'Sample Song',
      artist: 'Artist A / Artist B',
      album: 'Sample Album',
      duration: 123000,
      file_size: 1024,
      modified_at: 1,
      cover_hash: null
    })

    expect(track.song.artists).toEqual([
      { id: createArtistId('Artist A'), name: 'Artist A' },
      { id: createArtistId('Artist B'), name: 'Artist B' }
    ])
  })

  it('maps folder list rows into enabled booleans and song counts', () => {
    expect(
      mapFolderListRow({
        id: 'folder-1',
        path: 'D:\\Music',
        name: 'Music',
        enabled: 0,
        created_at: 1,
        last_scanned_at: null,
        song_count: 12
      })
    ).toEqual({
      id: 'folder-1',
      path: 'D:\\Music',
      name: 'Music',
      enabled: false,
      createdAt: 1,
      lastScannedAt: null,
      songCount: 12
    })
  })

  it('normalizes null cover hashes and zero totals in artist and album summaries', () => {
    expect(
      toArtistSummary({
        artist: 'Artist A',
        track_count: 3,
        total_duration: null,
        cover_hash: null
      })
    ).toEqual({
      id: createArtistId('Artist A'),
      name: 'Artist A',
      trackCount: 3,
      totalDuration: 0,
      coverHash: null
    })

    expect(
      toAlbumSummary({
        album: 'Album A',
        artist: 'Artist A',
        track_count: 4,
        total_duration: null,
        cover_hash: null
      })
    ).toEqual({
      id: createAlbumId('Artist A', 'Album A'),
      name: 'Album A',
      artist: 'Artist A',
      trackCount: 4,
      totalDuration: 0,
      coverHash: null
    })
  })
})
