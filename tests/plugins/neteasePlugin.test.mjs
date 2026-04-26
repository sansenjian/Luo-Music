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

async function createAdapter(httpGet) {
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
    logger: createLogger()
  }

  return {
    adapter: await neteasePlugin.create(ctx)
  }
}

describe('Netease external plugin', () => {
  it('adds randomCNIP and timestamp when fetching song URLs', async () => {
    const httpGet = vi.fn().mockResolvedValue({
      data: [{ url: 'http://m702.music.126.net/song.mp3' }]
    })
    const { adapter } = await createAdapter(httpGet)

    await expect(adapter.getSongUrl({ id: '1969519579' })).resolves.toBe(
      'http://m702.music.126.net/song.mp3'
    )

    const requestedUrl = new URL(httpGet.mock.calls[0][0])
    expect(requestedUrl.pathname).toBe('/song/url/v1')
    expect(requestedUrl.searchParams.get('id')).toBe('1969519579')
    expect(requestedUrl.searchParams.get('level')).toBe('standard')
    expect(requestedUrl.searchParams.get('randomCNIP')).toBe('true')
    expect(Number(requestedUrl.searchParams.get('timestamp'))).toBeGreaterThan(0)
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

    await expect(adapter.getSongUrl({ id: '1969519579', options: 'higher' })).resolves.toBe(
      'http://m802.music.126.net/fallback.mp3'
    )

    const requestedUrl = new URL(httpGet.mock.calls[1][0])
    expect(requestedUrl.pathname).toBe('/song/url')
    expect(requestedUrl.searchParams.get('id')).toBe('1969519579')
    expect(requestedUrl.searchParams.get('br')).toBe('192000')
    expect(requestedUrl.searchParams.get('randomCNIP')).toBe('true')
    expect(Number(requestedUrl.searchParams.get('timestamp'))).toBeGreaterThan(0)
  })
})
