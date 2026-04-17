import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const LOCAL_MEDIA_SCHEME = 'luo-media'

let localMediaProtocolRegistered = false

type ElectronProtocolModule = {
  protocol?: {
    registerSchemesAsPrivileged?: (
      customSchemes: Array<{
        scheme: string
        privileges: {
          standard?: boolean
          secure?: boolean
          supportFetchAPI?: boolean
          stream?: boolean
          corsEnabled?: boolean
        }
      }>
    ) => void
    handle?: (scheme: string, handler: (request: Request) => Response | Promise<Response>) => void
  }
  net?: {
    fetch: (input: string | URL) => Promise<Response>
  }
}

function getElectronProtocolModule(): ElectronProtocolModule {
  const electronModule = require('electron') as ElectronProtocolModule | string
  if (typeof electronModule !== 'object' || electronModule === null) {
    return {}
  }

  return electronModule
}

function registerPrivilegedLocalMediaScheme(): void {
  const { protocol } = getElectronProtocolModule()
  protocol?.registerSchemesAsPrivileged?.([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

registerPrivilegedLocalMediaScheme()

export function createLocalMediaUrl(filePath: string): string {
  return `${LOCAL_MEDIA_SCHEME}://media?path=${encodeURIComponent(path.resolve(filePath))}`
}

function resolveRequestFilePath(requestUrl: string): string | null {
  try {
    const parsedUrl = new URL(requestUrl)
    const filePath = parsedUrl.searchParams.get('path')
    if (!filePath) {
      return null
    }

    return path.resolve(filePath)
  } catch {
    return null
  }
}

export function registerLocalMediaProtocol(): void {
  if (localMediaProtocolRegistered) {
    return
  }

  const { net, protocol } = getElectronProtocolModule()
  if (!net?.fetch || !protocol?.handle) {
    return
  }

  protocol.handle(LOCAL_MEDIA_SCHEME, request => {
    const filePath = resolveRequestFilePath(request.url)
    if (!filePath) {
      return new Response('Missing local media path', {
        status: 400
      })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  localMediaProtocolRegistered = true
}
