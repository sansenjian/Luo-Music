import { describe, expect, it } from 'vitest'

import { mapTrackRow } from '../../electron/local-library/repository.mappers'
import { createArtistId } from '../../electron/local-library/repository.helpers'

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
})
