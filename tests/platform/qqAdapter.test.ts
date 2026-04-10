import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

vi.mock('@/api/qqmusic', () => ({
  qqMusicAdapter: {
    fetch: fetchMock
  }
}))

describe('QQMusicAdapter getSongUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
  })

  it('falls back to getMusicPlay when getSongInfo fails', async () => {
    fetchMock.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/getSongInfo/')) {
        throw new Error('getSongInfo failed')
      }
      if (endpoint === '/getMusicPlay') {
        return { success: true, data: { url: 'http://play.url' } }
      }
      return { success: false }
    })

    const { QQMusicAdapter } = await import('@/platform/music/qq')
    const adapter = new QQMusicAdapter()

    const url = await adapter.getSongUrl('songmid')

    expect(url).toBe('http://play.url')

    const playCall = fetchMock.mock.calls.find(([endpoint]) => endpoint === '/getMusicPlay')
    expect(playCall?.[1]).toEqual({ songmid: 'songmid', mediaId: undefined, resType: 'play' })
  })

  it('returns url from playUrl map even when success flag is false', async () => {
    fetchMock.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/getSongInfo/')) {
        return { success: true, data: {} }
      }
      if (endpoint === '/getMusicPlay') {
        return {
          success: false,
          data: {
            playUrl: {
              songmid: { url: 'http://play.url.from.map' }
            }
          }
        }
      }
      return { success: false }
    })

    const { QQMusicAdapter } = await import('@/platform/music/qq')
    const adapter = new QQMusicAdapter()

    const url = await adapter.getSongUrl('songmid')
    expect(url).toBe('http://play.url.from.map')
  })

  it('supports string playUrl entries from upstream response', async () => {
    fetchMock.mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/getSongInfo/')) {
        return { success: true, data: {} }
      }
      if (endpoint === '/getMusicPlay') {
        return {
          success: true,
          data: {
            playUrl: {
              songmid: 'http://play.url.string.entry'
            }
          }
        }
      }
      return { success: false }
    })

    const { QQMusicAdapter } = await import('@/platform/music/qq')
    const adapter = new QQMusicAdapter()

    const url = await adapter.getSongUrl('songmid')
    expect(url).toBe('http://play.url.string.entry')
  })
})

describe('QQMusicAdapter getLyric', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
  })

  it('uses lyric data even when success flag is false', async () => {
    fetchMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/getLyric') {
        return {
          success: false,
          data: {
            lyric: '[00:00.00]hello',
            trans: '[00:00.00]你好'
          }
        }
      }
      return { success: false }
    })

    const { QQMusicAdapter } = await import('@/platform/music/qq')
    const adapter = new QQMusicAdapter()

    const lyric = await adapter.getLyric('songmid')
    expect(lyric).toEqual({
      lrc: '[00:00.00]hello',
      tlyric: '[00:00.00]你好',
      romalrc: ''
    })
  })

  it('supports object lyric payload shape', async () => {
    fetchMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/getLyric') {
        return {
          success: true,
          data: {
            lyric: { lyric: '[00:01.00]object lyric' },
            tlyric: { lyric: '[00:01.00]对象翻译' },
            romalrc: { lyric: '[00:01.00]roma lyric' }
          }
        }
      }
      return { success: false }
    })

    const { QQMusicAdapter } = await import('@/platform/music/qq')
    const adapter = new QQMusicAdapter()

    const lyric = await adapter.getLyric('songmid')
    expect(lyric).toEqual({
      lrc: '[00:01.00]object lyric',
      tlyric: '[00:01.00]对象翻译',
      romalrc: '[00:01.00]roma lyric'
    })
  })
})
