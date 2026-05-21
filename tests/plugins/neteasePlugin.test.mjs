import { describe, expect, it, vi } from 'vitest'
import neteasePlugin from '../../plugins/third-party/netease/index.mjs'

function createLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}

async function createAdapter(httpGet, secrets = {}) {
  const ctx = {
    platformId: 'netease',
    settings: {
      apiBase: 'http://127.0.0.1:14532',
      audioLevel: 'standard',
      verboseLog: false
    },
    http: {
      get: httpGet
    },
    secrets: {
      get: vi.fn(key => secrets[key]),
      set: vi.fn(),
      remove: vi.fn()
    },
    logger: createLogger()
  }

  return {
    adapter: await neteasePlugin.create(ctx),
    ctx
  }
}

describe('Netease external plugin', () => {
  it('adds randomCNIP and timestamp when fetching song URLs', async () => {
    const httpGet = vi.fn().mockResolvedValue({
      data: [{ url: 'http://m702.music.126.net/song.mp3' }]
    })
    const { adapter } = await createAdapter(httpGet)

    await expect(adapter.getSongUrl({ id: '1969519579' })).resolves.toEqual({
      url: 'http://m702.music.126.net/song.mp3',
      mediaId: '1969519579',
      level: 'standard',
      bitrate: 128000
    })

    const requestedUrl = new URL(httpGet.mock.calls[0][0])
    expect(requestedUrl.pathname).toBe('/song/url/v1')
    expect(requestedUrl.searchParams.get('id')).toBe('1969519579')
    expect(requestedUrl.searchParams.get('level')).toBe('standard')
    expect(requestedUrl.searchParams.get('randomCNIP')).toBe('true')
    expect(requestedUrl.searchParams.get('unblock')).toBe('true')
    expect(Number(requestedUrl.searchParams.get('timestamp'))).toBeGreaterThan(0)
  })

  it('passes the stored login cookie when fetching song URLs', async () => {
    const httpGet = vi.fn().mockResolvedValue({
      data: [{ url: 'http://m702.music.126.net/vip-song.mp3' }]
    })
    const { adapter } = await createAdapter(httpGet, {
      cookie: 'MUSIC_U=member-session; __csrf=csrf-token'
    })

    await expect(adapter.getSongUrl({ id: '33894312' })).resolves.toEqual({
      url: 'http://m702.music.126.net/vip-song.mp3',
      mediaId: '33894312',
      level: 'standard',
      bitrate: 128000
    })

    const requestedUrl = new URL(httpGet.mock.calls[0][0])
    expect(requestedUrl.pathname).toBe('/song/url/v1')
    expect(requestedUrl.searchParams.get('cookie')).toBe(
      'MUSIC_U=member-session; __csrf=csrf-token'
    )
    expect(requestedUrl.searchParams.get('unblock')).toBe('true')
  })

  it('adds randomCNIP and timestamp when falling back to the legacy song URL endpoint', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ url: null }]
      })
      .mockResolvedValueOnce({
        data: [{ url: 'http://m802.music.126.net/fallback.mp3' }]
      })
    const { adapter } = await createAdapter(httpGet)

    await expect(adapter.getSongUrl({ id: '1969519579', options: 'higher' })).resolves.toEqual({
      url: 'http://m802.music.126.net/fallback.mp3',
      mediaId: '1969519579',
      level: 'higher',
      bitrate: 192000
    })

    const requestedUrl = new URL(httpGet.mock.calls[1][0])
    expect(requestedUrl.pathname).toBe('/song/url')
    expect(requestedUrl.searchParams.get('id')).toBe('1969519579')
    expect(requestedUrl.searchParams.get('br')).toBe('192000')
    expect(requestedUrl.searchParams.get('randomCNIP')).toBe('true')
    expect(Number(requestedUrl.searchParams.get('timestamp'))).toBeGreaterThan(0)
  })

  it('passes the stored login cookie to the legacy song URL endpoint', async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ url: null }]
      })
      .mockResolvedValueOnce({
        data: [{ url: 'http://m802.music.126.net/vip-fallback.mp3' }]
      })
    const { adapter } = await createAdapter(httpGet, {
      cookie: 'MUSIC_U=member-session; __csrf=csrf-token'
    })

    await expect(adapter.getSongUrl({ id: '33894312', options: 'exhigh' })).resolves.toEqual({
      url: 'http://m802.music.126.net/vip-fallback.mp3',
      mediaId: '33894312',
      level: 'exhigh',
      bitrate: 320000
    })

    const requestedUrl = new URL(httpGet.mock.calls[1][0])
    expect(requestedUrl.pathname).toBe('/song/url')
    expect(requestedUrl.searchParams.get('cookie')).toBe(
      'MUSIC_U=member-session; __csrf=csrf-token'
    )
  })

  it('normalizes song URL object metadata from v1 responses', async () => {
    const httpGet = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1969519579,
          url: 'https://m801.music.126.net/lossless.flac',
          level: 'lossless',
          br: 999000
        }
      ]
    })
    const { adapter } = await createAdapter(httpGet)

    await expect(
      adapter.getSongUrl({
        id: '1969519579',
        options: {
          level: 'lossless',
          mediaId: 'media-1'
        }
      })
    ).resolves.toEqual({
      url: 'https://m801.music.126.net/lossless.flac',
      mediaId: 1969519579,
      level: 'lossless',
      bitrate: 999000
    })
  })

  it('imports a standardized cookie session into plugin secrets', async () => {
    const httpGet = vi.fn()
    const { adapter, ctx } = await createAdapter(httpGet)

    await expect(
      adapter['auth.importSession']({
        session: {
          credential: {
            type: 'cookie',
            value: 'MUSIC_U=legacy-session'
          },
          account: {
            id: 42,
            nickname: 'Tester',
            avatarUrl: 'https://example.com/avatar.png'
          }
        }
      })
    ).resolves.toEqual({
      platform: 'netease',
      status: 'authenticated',
      account: expect.objectContaining({
        id: 42,
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.png'
      }),
      message: '登录会话已导入'
    })

    expect(ctx.secrets.set).toHaveBeenCalledWith('cookie', 'MUSIC_U=legacy-session')
    expect(ctx.secrets.set).toHaveBeenCalledWith(
      'account',
      expect.objectContaining({
        id: 42,
        nickname: 'Tester'
      })
    )
  })

  it('preserves zero session expiration when importing a cookie session', async () => {
    const httpGet = vi.fn()
    const { adapter } = await createAdapter(httpGet)

    await expect(
      adapter['auth.importSession']({
        session: {
          credential: {
            type: 'cookie',
            value: 'MUSIC_U=legacy-session'
          },
          expiresAt: 0
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        platform: 'netease',
        status: 'authenticated',
        expiresAt: 0
      })
    )
  })

  it('normalizes pagination before returning empty playlist tracks for missing ids', async () => {
    const httpGet = vi.fn()
    const { adapter } = await createAdapter(httpGet)

    await expect(
      adapter['library.getPlaylistTracks']({ id: '', limit: -2.5, offset: -10.2 })
    ).resolves.toEqual({
      list: [],
      page: {
        limit: 50,
        offset: 0,
        hasMore: false
      }
    })

    expect(httpGet).not.toHaveBeenCalled()
  })

  it('clamps small positive playlist track limits before empty id pagination', async () => {
    const httpGet = vi.fn()
    const { adapter } = await createAdapter(httpGet)

    await expect(
      adapter['library.getPlaylistTracks']({ id: '', limit: 0.4, offset: 0 })
    ).resolves.toEqual({
      list: [],
      page: {
        limit: 1,
        offset: 0,
        hasMore: false
      }
    })
  })

  it('exposes standard account and library APIs backed by plugin secrets', async () => {
    const httpGet = vi.fn(url => {
      const requestUrl = new URL(url)

      if (requestUrl.pathname === '/user/account') {
        return Promise.resolve({
          account: { id: 42 },
          profile: { userId: 42, nickname: 'Tester', avatarUrl: '//p3.music.126.net/avatar.jpg' }
        })
      }

      if (requestUrl.pathname === '/user/detail') {
        return Promise.resolve({
          profile: { userId: 42, nickname: 'Tester', avatarUrl: '//p3.music.126.net/avatar.jpg' }
        })
      }

      if (requestUrl.pathname === '/likelist') {
        return Promise.resolve({ ids: [101, 102, 103] })
      }

      if (requestUrl.pathname === '/song/detail') {
        return Promise.resolve({
          songs: [
            {
              id: 102,
              name: 'Liked Song',
              ar: [{ id: 1, name: 'Artist' }],
              al: { id: 2, name: 'Album', picUrl: '//p3.music.126.net/cover.jpg' },
              dt: 120000
            }
          ]
        })
      }

      if (requestUrl.pathname === '/user/playlist') {
        return Promise.resolve({
          playlist: [
            { id: 201, name: 'Created', coverImgUrl: '//p3.music.126.net/p1.jpg', trackCount: 10 },
            {
              id: 202,
              name: 'Subscribed',
              coverImgUrl: '//p3.music.126.net/p2.jpg',
              trackCount: 20,
              subscribed: true
            }
          ]
        })
      }

      if (requestUrl.pathname === '/playlist/track/all') {
        return Promise.resolve({
          total: 1,
          songs: [
            {
              id: 301,
              name: 'Playlist Song',
              ar: [],
              al: { id: 3, name: 'Playlist Album', picUrl: '' },
              dt: 90000
            }
          ]
        })
      }

      return Promise.resolve({})
    })
    const { adapter } = await createAdapter(httpGet, { cookie: 'MUSIC_U=session' })

    await expect(adapter['account.getProfile']()).resolves.toEqual(
      expect.objectContaining({
        id: 42,
        nickname: 'Tester',
        avatarUrl: 'https://p3.music.126.net/avatar.jpg'
      })
    )
    await expect(
      adapter['library.getLikedSongs']({ userId: 42, limit: 1, offset: 1 })
    ).resolves.toEqual({
      list: [
        expect.objectContaining({
          id: 102,
          name: 'Liked Song',
          platform: 'netease'
        })
      ],
      page: {
        limit: 1,
        offset: 1,
        total: 3,
        hasMore: true
      }
    })
    await expect(adapter['library.getPlaylists']({ userId: 42, limit: 1 })).resolves.toEqual({
      list: [
        expect.objectContaining({
          id: 201,
          name: 'Created',
          coverImgUrl: 'https://p3.music.126.net/p1.jpg',
          subscribed: false
        })
      ],
      page: {
        limit: 1,
        offset: 0,
        total: 2,
        hasMore: true
      }
    })
    await expect(
      adapter['library.getPlaylistTracks']({ id: 201, limit: 50, offset: 0 })
    ).resolves.toEqual({
      list: [
        expect.objectContaining({
          id: 301,
          name: 'Playlist Song',
          platform: 'netease'
        })
      ],
      page: {
        limit: 50,
        offset: 0,
        total: 1,
        hasMore: false
      }
    })
  })
})
