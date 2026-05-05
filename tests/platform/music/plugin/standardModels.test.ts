import { describe, expect, it } from 'vite-plus/test'
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
        tracks: [{ id: 'song-1', duration: 1, album: {}, artists: [] }, { id: undefined }]
      },
      'demo'
    )

    expect(playlist?.tracks).toHaveLength(1)
    expect(playlist?.tracks[0].platform).toBe('demo')
  })

  it('supports legacy rlyric and object song-url results', () => {
    expect(normalizePluginLyricResult({ lrc: 'a', tlyric: 'b', rlyric: 'c' })).toEqual({
      lrc: 'a',
      tlyric: 'b',
      romalrc: 'c'
    })
    expect(normalizePluginSongUrlResult({ url: 'https://example.test/a.mp3' })).toBe(
      'https://example.test/a.mp3'
    )
    expect(normalizePluginSongUrlResult({ url: '' })).toBeNull()
  })
})
