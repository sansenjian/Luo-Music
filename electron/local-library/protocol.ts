import path from 'node:path'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const LOCAL_MEDIA_SCHEME = 'luo-media'

let localMediaProtocolRegistered = false
let localMediaRootsResolver: () => string[] = () => []

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

export function configureLocalMediaRootsResolver(resolver: () => string[]): void {
  localMediaRootsResolver = resolver
}

function resolveRealPath(targetPath: string): string | null {
  try {
    return realpathSync.native(path.resolve(targetPath))
  } catch {
    return null
  }
}

function normalizeComparisonPath(targetPath: string): string {
  return process.platform === 'win32' ? targetPath.toLocaleLowerCase() : targetPath
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTargetPath = normalizeComparisonPath(targetPath)
  const normalizedRootPath = normalizeComparisonPath(rootPath)
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath)

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function resolveRequestFilePath(requestUrl: string): { filePath: string | null; status: number } {
  try {
    const parsedUrl = new URL(requestUrl)
    if (parsedUrl.hostname !== 'media') {
      return {
        filePath: null,
        status: 400
      }
    }

    const requestedPath = parsedUrl.searchParams.get('path')
    if (!requestedPath) {
      return {
        filePath: null,
        status: 400
      }
    }

    const resolvedFilePath = resolveRealPath(requestedPath)
    if (!resolvedFilePath) {
      return {
        filePath: null,
        status: 404
      }
    }

    const allowedRoots = localMediaRootsResolver()
      .map(resolveRealPath)
      .filter((rootPath): rootPath is string => typeof rootPath === 'string')

    if (allowedRoots.length === 0) {
      return {
        filePath: null,
        status: 403
      }
    }

    if (!allowedRoots.some(rootPath => isPathWithinRoot(resolvedFilePath, rootPath))) {
      return {
        filePath: null,
        status: 403
      }
    }

    return {
      filePath: resolvedFilePath,
      status: 200
    }
  } catch {
    return {
      filePath: null,
      status: 400
    }
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

  protocol.handle(LOCAL_MEDIA_SCHEME, async request => {
    const { filePath, status } = resolveRequestFilePath(request.url)
    if (!filePath) {
      return new Response('Unauthorized local media path', {
        status
      })
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Failed to read local media file', {
        status: 500
      })
    }
  })

  localMediaProtocolRegistered = true
}
