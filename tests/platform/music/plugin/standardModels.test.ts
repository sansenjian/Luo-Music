import { describe, expect, it } from 'vitest'
import {
  normalizePluginLyricResult,
  normalizePluginPlaylistDetail,
  normalizePluginSearchResult,
  normalizePluginSong,
  normalizePluginSongUrlResult
} from '@/platform/music/plugin/standardModels'

describe('plugin standard model normalization', () => {
  it('normalizes song defaults and keeps duration in milliseconds', () => {
    const song = normalizePluginSong(
      {
        id: 'song-1',
        name: 'Song',
        artists: [{ name: 'Artist' }],
        album: { name: 'Album' },
        duration: 201234.4,
        platform: 'wrong',
        originalId: null,
        mvid: null,
        mediaId: { invalid: true }
      },
      'netease'
    )

    expect(song).toMatchObject({
      id: 'song-1',
      name: 'Song',
      duration: 201234,
      platform: 'netease',
      originalId: 'song-1',
      mvid: 0,
      album: {
        id: 'song-1-album',
        name: 'Album',
        picUrl: ''
      }
    })
    expect(song?.mediaId).toBeUndefined()
    expect(song?.artists[0]).toEqual({ id: 'song-1-artist-0', name: 'Artist' })
  })

  it('preserves framework fields and keeps platform-specific data under extra', () => {
    const song = normalizePluginSong(
      {
        id: 1001,
        name: 'Standard Song',
        artists: [{ id: 'artist-1', name: 'Artist' }],
        album: { id: 'album-1', name: 'Album', picUrl: 'cover.jpg' },
        duration: 180000,
        mvid: 'mv-1',
        platform: 'raw-platform',
        originalId: 'raw-1001',
        url: 'https://media.example.test/song.mp3',
        mediaId: 'media-1',
        unavailable: true,
        errorMessage: 'region limited',
        extra: {
          qqSongmid: '003',
          neteasePrivilege: { fee: 1 }
        }
      },
      'third-party'
    )

    expect(song).toEqual({
      id: 1001,
      name: 'Standard Song',
      artists: [{ id: 'artist-1', name: 'Artist' }],
      album: { id: 'album-1', name: 'Album', picUrl: 'cover.jpg' },
      duration: 180000,
      mvid: 'mv-1',
      platform: 'third-party',
      originalId: 'raw-1001',
      url: 'https://media.example.test/song.mp3',
      mediaId: 'media-1',
      unavailable: true,
      errorMessage: 'region limited',
      extra: {
        qqSongmid: '003',
        neteasePrivilege: { fee: 1 }
      }
    })
  })

  it('drops invalid songs and degrades invalid duration to zero', () => {
    expect(normalizePluginSong({ id: false }, 'qq')).toBeNull()

    const result = normalizePluginSearchResult(
      {
        list: [
          { id: 1, name: 'ok', artists: [], album: {}, duration: -1, mvid: 0, originalId: 1 },
          { id: null, name: 'bad' }
        ],
        total: 9
      },
      'qq'
    )

    expect(result.total).toBe(9)
    expect(result.list).toHaveLength(1)
    expect(result.list[0].duration).toBe(0)
  })

  it('normalizes playlist tracks without requiring full valid input', () => {
    const playlist = normalizePluginPlaylistDetail(
      {
        id: 'playlist-1',
        name: 'Playlist',
        coverImgUrl: 'cover.png',
        description: 'A playlist',
        trackCount: 1.2,
        tracks: [{ id: 'song-1', duration: 1, album: {}, artists: [] }, { id: undefined }]
      },
      'demo'
    )

    expect(playlist).toMatchObject({
      id: 'playlist-1',
      name: 'Playlist',
      coverImgUrl: 'cover.png',
      description: 'A playlist',
      trackCount: 1
    })
    expect(playlist?.tracks).toHaveLength(1)
    expect(playlist?.tracks[0].platform).toBe('demo')
  })

  it('normalizes lyric objects with standard defaults and legacy rlyric support', () => {
    expect(normalizePluginLyricResult({ lrc: 'a', tlyric: 'b', rlyric: 'c' })).toEqual({
      lrc: 'a',
      tlyric: 'b',
      romalrc: 'c'
    })
    expect(normalizePluginLyricResult({ lrc: 123, tlyric: null, romalrc: undefined })).toEqual({
      lrc: '',
      tlyric: '',
      romalrc: ''
    })
  })

  it('accepts legacy string song-url results and standard URL objects', () => {
    expect(normalizePluginSongUrlResult({ url: 'https://example.test/a.mp3' })).toBe(
      'https://example.test/a.mp3'
    )
    expect(
      normalizePluginSongUrlResult({
        url: 'https://example.test/b.mp3',
        mediaId: 'media-2',
        expiresAt: 0,
        level: 'lossless',
        bitrate: 999000
      })
    ).toBe('https://example.test/b.mp3')
    expect(normalizePluginSongUrlResult({ url: '' })).toBeNull()
    expect(normalizePluginSongUrlResult({ url: null })).toBeNull()
  })
})
