import { describe, expect, it, vi } from 'vite-plus/test'
import type { ExternalPluginRegistration } from '../../electron/plugins/types'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userData')
  }
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    get() {
      return {}
    }

    set() {}
  }
}))

vi.mock('../../electron/logger', () => ({
  default: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { ExternalPluginHost } from '../../electron/plugins/ExternalPluginHost'

type ExternalPluginHostInternals = {
  handleHttpRequest(
    registration: ExternalPluginRegistration,
    method: 'GET' | 'POST',
    url: string,
    payload: unknown,
    options?: {
      headers?: Record<string, string>
      timeoutMs?: number
    }
  ): Promise<unknown>
}

function makeRegistration(): ExternalPluginRegistration {
  return {
    manifest: {
      manifestVersion: 1,
      id: 'com.luomusic.plugin.netease',
      name: 'Netease Music',
      version: '1.0.1',
      platformId: 'netease',
      source: 'external',
      runtime: 'external-host',
      entry: { main: 'index.mjs', module: 'esm' },
      capabilities: {
        search: true,
        songUrl: false,
        songDetail: false,
        lyric: false,
        playlistDetail: false,
        needsHydration: false,
        supportsLyricFetch: false,
        supportsUrlRefreshOnFailure: false
      },
      permissions: {
        network: {
          domains: ['localhost']
        }
      }
    },
    installPath: '/plugins/netease/1.0.1',
    entryPath: '/plugins/netease/1.0.1/index.mjs',
    checksum: 'checksum',
    state: {
      pluginId: 'com.luomusic.plugin.netease',
      platformId: 'netease',
      version: '1.0.1',
      installPath: '/plugins/netease/1.0.1',
      enabled: true,
      settings: {},
      storage: {},
      consecutiveFailures: 0,
      diagnostics: [],
      installedAt: 1000,
      updatedAt: 1000
    }
  }
}

describe('ExternalPluginHost HTTP proxy', () => {
  it('allows loopback requests when localhost is declared', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const host = new ExternalPluginHost({
      stateStore: {} as never,
      fetchImpl: fetchImpl as unknown as typeof fetch
    }) as unknown as ExternalPluginHostInternals

    await expect(
      host.handleHttpRequest(makeRegistration(), 'GET', 'http://127.0.0.1:14532/cloudsearch', {
        keywords: 'test'
      })
    ).resolves.toEqual({ ok: true })

    const requestedUrl = fetchImpl.mock.calls[0][0] as URL
    expect(requestedUrl.hostname).toBe('127.0.0.1')
    expect(requestedUrl.searchParams.get('keywords')).toBe('test')
  })

  it('adds connection diagnostics to fetch failures', async () => {
    const fetchError = new TypeError('fetch failed')
    ;(fetchError as Error & { cause?: unknown }).cause = {
      code: 'ECONNREFUSED',
      address: '127.0.0.1',
      port: 14532
    }

    const host = new ExternalPluginHost({
      stateStore: {} as never,
      fetchImpl: vi.fn().mockRejectedValue(fetchError) as unknown as typeof fetch
    }) as unknown as ExternalPluginHostInternals

    await expect(
      host.handleHttpRequest(
        makeRegistration(),
        'GET',
        'http://127.0.0.1:14532/cloudsearch',
        undefined
      )
    ).rejects.toThrow(
      'Plugin HTTP GET http://127.0.0.1:14532/cloudsearch failed: fetch failed (ECONNREFUSED 127.0.0.1 14532)'
    )
  })

  it('passes plugin-provided headers and timeout signal to fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      })
    )
    const host = new ExternalPluginHost({
      stateStore: {} as never,
      fetchImpl: fetchImpl as unknown as typeof fetch
    }) as unknown as ExternalPluginHostInternals

    await expect(
      host.handleHttpRequest(
        makeRegistration(),
        'POST',
        'http://127.0.0.1:14532/login',
        { ok: true },
        {
          headers: {
            Cookie: 'MUSIC_U=abc'
          },
          timeoutMs: 1000
        }
      )
    ).resolves.toBe('ok')

    const init = fetchImpl.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      Cookie: 'MUSIC_U=abc'
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})
