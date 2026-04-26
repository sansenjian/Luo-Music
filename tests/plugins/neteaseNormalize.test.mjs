import { describe, expect, it } from 'vitest'
import { normalizePlaylist, normalizeSong } from '../../plugins/third-party/netease/normalize.mjs'

describe('Netease external plugin normalization', () => {
  it('upgrades Netease image CDN covers to https', () => {
    const song = normalizeSong(
      {
        id: 1,
        name: 'Song',
        ar: [],
        al: {
          id: 2,
          name: 'Album',
          picUrl: 'http://p4.music.126.net/8VjNRzBSVBoVl5oDkmNaZQ==/109951168106883997.jpg'
        }
      },
      'netease'
    )

    expect(song.album.picUrl).toBe(
      'https://p4.music.126.net/8VjNRzBSVBoVl5oDkmNaZQ==/109951168106883997.jpg'
    )
  })

  it('normalizes protocol-relative playlist covers', () => {
    const playlist = normalizePlaylist(
      {
        id: 1,
        name: 'Playlist',
        coverImgUrl: '//p3.music.126.net/example/cover.jpg',
        tracks: []
      },
      'netease'
    )

    expect(playlist.coverImgUrl).toBe('https://p3.music.126.net/example/cover.jpg')
  })

  it('keeps non-Netease http image urls unchanged', () => {
    const song = normalizeSong(
      {
        id: 1,
        name: 'Song',
        artists: [],
        album: {
          id: 2,
          name: 'Album',
          picUrl: 'http://example.com/cover.jpg'
        }
      },
      'netease'
    )

    expect(song.album.picUrl).toBe('http://example.com/cover.jpg')
  })
})
