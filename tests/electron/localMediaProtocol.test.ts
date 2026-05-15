import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registerSchemesAsPrivilegedMock = vi.hoisted(() => vi.fn())
const protocolHandleMock = vi.hoisted(() => vi.fn())

const createdPaths: string[] = []

async function createTempPath(name: string): Promise<string> {
  const directoryPath = await mkdtemp(path.join(tmpdir(), `${name}-`))
  createdPaths.push(directoryPath)
  return directoryPath
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const targetPath = createdPaths.pop()
    if (!targetPath) {
      continue
    }

    await rm(targetPath, { recursive: true, force: true })
  }
  vi.unstubAllGlobals()
})

describe('localMediaProtocol', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('registers the privileged streaming scheme with CORS for proxied media', async () => {
    await import('../../electron/local-library/protocol')

    expect(registerSchemesAsPrivilegedMock).not.toHaveBeenCalled()

    const privilegedModule = await import('../../electron/local-library/protocol.privileged')
    privilegedModule.registerPrivilegedLocalMediaScheme({
      protocol: {
        registerSchemesAsPrivileged: registerSchemesAsPrivilegedMock
      }
    })
    privilegedModule.registerPrivilegedLocalMediaScheme({
      protocol: {
        registerSchemesAsPrivileged: registerSchemesAsPrivilegedMock
      }
    })

    expect(registerSchemesAsPrivilegedMock).toHaveBeenCalledTimes(1)
    expect(registerSchemesAsPrivilegedMock).toHaveBeenCalledWith([
      {
        scheme: 'luo-media',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
          corsEnabled: true
        }
      }
    ])
  })

  it('builds fetch init from the original request so range headers are preserved for seeking', async () => {
    const protocolModule = await import('../../electron/local-library/protocol')
    const request = new Request('luo-media://media?path=/music/song.mp3', {
      headers: {
        Range: 'bytes=32-'
      },
      method: 'GET'
    })

    const init = protocolModule.buildLocalMediaFetchInit(request)

    expect(init.method).toBe('GET')
    expect(init.headers).toBeInstanceOf(Headers)
    expect(init.headers.get('range')).toBe('bytes=32-')
  })

  it('proxies remote media through Electron net.fetch without forwarding app referrer headers', async () => {
    const protocolModule = await import('../../electron/local-library/protocol')
    const netFetchMock = vi.fn().mockResolvedValue(
      new Response('on', {
        status: 206,
        statusText: 'Partial Content',
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '2',
          'Content-Range': 'bytes 1-2/4',
          'Content-Type': 'audio/mpeg'
        }
      })
    )

    protocolModule.registerLocalMediaProtocol({
      net: {
        fetch: netFetchMock
      },
      protocol: {
        handle: protocolHandleMock
      }
    })

    const handler = protocolHandleMock.mock.calls[0]?.[1] as
      | ((request: Request) => Promise<Response>)
      | undefined
    expect(handler).toBeTypeOf('function')

    const sourceUrl = 'http://m7.music.126.net/song.mp3?vuutv=a+b='
    const response = await handler!(
      new Request(protocolModule.createRemoteMediaUrl(sourceUrl), {
        headers: {
          Range: 'bytes=1-2',
          Referer: 'file:///app/index.html'
        }
      })
    )

    expect(netFetchMock).toHaveBeenCalledTimes(1)
    expect(netFetchMock.mock.calls[0]?.[0]).toBe(sourceUrl)
    const init = netFetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('range')).toBe('bytes=1-2')
    expect(headers.get('accept')).toBe('*/*')
    expect(headers.get('user-agent')).toContain('Chrome/')
    expect(headers.get('referer')).toBeNull()
    expect(response.status).toBe(206)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('content-range')).toBe('bytes 1-2/4')
    await expect(response.text()).resolves.toBe('on')
  })

  it('blocks remote media proxy requests to local network addresses', async () => {
    const protocolModule = await import('../../electron/local-library/protocol')
    const netFetchMock = vi.fn()

    protocolModule.registerLocalMediaProtocol({
      net: {
        fetch: netFetchMock
      },
      protocol: {
        handle: protocolHandleMock
      }
    })

    const handler = protocolHandleMock.mock.calls[0]?.[1] as
      | ((request: Request) => Promise<Response>)
      | undefined
    expect(handler).toBeTypeOf('function')

    const response = await handler!(
      new Request(protocolModule.createRemoteMediaUrl('http://127.0.0.1/song.mp3'))
    )

    expect(response.status).toBe(403)
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('only serves whitelisted files from configured roots', async () => {
    const rootPath = await createTempPath('local-media-root')
    const outsideRootPath = await createTempPath('local-media-outside')
    const songPath = path.join(rootPath, 'song.mp3')
    const blockedPath = path.join(rootPath, 'secret.pdf')
    const outsideSongPath = path.join(outsideRootPath, 'outside.mp3')

    await writeFile(songPath, 'song')
    await writeFile(blockedPath, 'pdf')
    await writeFile(outsideSongPath, 'outside')

    const protocolModule = await import('../../electron/local-library/protocol')
    protocolModule.configureLocalMediaRootsResolver(() => [rootPath])
    protocolModule.registerLocalMediaProtocol({
      protocol: {
        handle: protocolHandleMock
      }
    })

    expect(protocolHandleMock).toHaveBeenCalledTimes(1)

    const handler = protocolHandleMock.mock.calls[0]?.[1] as
      | ((request: Request) => Promise<Response>)
      | undefined
    expect(handler).toBeTypeOf('function')

    const allowedResponse = await handler!(
      new Request(`luo-media://media?path=${encodeURIComponent(songPath)}`)
    )
    expect(allowedResponse.status).toBe(200)
    await expect(allowedResponse.text()).resolves.toBe('song')
    expect(allowedResponse.headers.get('content-type')).toBe('audio/mpeg')
    expect(allowedResponse.headers.get('accept-ranges')).toBe('bytes')

    const rangedResponse = await handler!(
      new Request(`luo-media://media?path=${encodeURIComponent(songPath)}`, {
        headers: {
          Range: 'bytes=1-2'
        }
      })
    )
    expect(rangedResponse.status).toBe(206)
    await expect(rangedResponse.text()).resolves.toBe('on')
    expect(rangedResponse.headers.get('content-range')).toBe('bytes 1-2/4')

    const blockedExtensionResponse = await handler!(
      new Request(`luo-media://media?path=${encodeURIComponent(blockedPath)}`)
    )
    expect(blockedExtensionResponse.status).toBe(403)

    const outsideRootResponse = await handler!(
      new Request(`luo-media://media?path=${encodeURIComponent(outsideSongPath)}`)
    )
    expect(outsideRootResponse.status).toBe(403)
  })
})
