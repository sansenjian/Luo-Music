import { describe, expect, it } from 'vitest'

import {
  resolveLocalSongName,
  resolveLocalTrackArtist,
  resolveLocalTrackName,
  shouldPromoteArtistTextToLocalTitle
} from '@/utils/localLibrary/display'
import type { Song } from '@/platform/music/interface'
import type { LocalLibraryTrack } from '@shared/types/localLibrary'

function createLocalSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'local-song',
    name: 'Song',
    artists: [{ id: 'artist', name: 'Artist' }],
    album: { id: 'album', name: 'Album', picUrl: '' },
    duration: 180000,
    mvid: 0,
    platform: 'local',
    originalId: 'local-song',
    extra: {
      localSource: true,
      localFilePath: 'D:\\Music\\Song.mp3'
    },
    ...overrides
  }
}

function createLocalTrack(overrides: Partial<LocalLibraryTrack> = {}): LocalLibraryTrack {
  const song = createLocalSong()

  return {
    id: 'local-track',
    folderId: 'folder',
    filePath: 'D:\\Music\\Song.mp3',
    fileName: 'Song.mp3',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180000,
    fileSize: 1024,
    modifiedAt: 1,
    coverHash: null,
    song,
    ...overrides
  }
}

describe('local library display helpers', () => {
  it('uses file names when local track titles are unknown placeholders', () => {
    const track = createLocalTrack({
      fileName: '5.mp3',
      title: '未知歌曲',
      artist: '未知艺术家',
      song: createLocalSong({
        name: '未知歌曲',
        artists: [{ id: 'unknown', name: '未知艺术家' }]
      })
    })

    expect(resolveLocalTrackName(track)).toBe('5')
    expect(resolveLocalTrackArtist(track)).toBe('未知艺术家')
  })

  it('uses local file paths when playlist songs have unknown placeholder names', () => {
    const song = createLocalSong({
      name: '未知歌曲',
      extra: {
        localSource: true,
        localFilePath: 'D:\\Music\\5.mp3'
      }
    })

    expect(resolveLocalSongName(song)).toBe('5')
  })

  it('promotes local artist text only when it becomes the title fallback', () => {
    const song = createLocalSong({
      name: '',
      extra: {
        localSource: true
      }
    })
    const promotedName = resolveLocalSongName(song, 'カンフー少女')

    expect(promotedName).toBe('カンフー少女')
    expect(shouldPromoteArtistTextToLocalTitle(song, promotedName, 'カンフー少女')).toBe(true)
  })
})
