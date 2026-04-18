import path from 'node:path'
import { constants as fsConstants, realpathSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { LOCAL_MEDIA_SCHEME } from './protocol.privileged'

let localMediaProtocolRegistered = false
let localMediaRootsResolver: () => string[] = () => []

const ALLOWED_LOCAL_MEDIA_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
  '.ape',
  '.opus',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
])

export type ElectronLocalMediaProtocolModule = {
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
}

function getElectronProtocolModule(): ElectronLocalMediaProtocolModule {
  const electronModule = require('electron') as ElectronLocalMediaProtocolModule | string
  if (typeof electronModule !== 'object' || electronModule === null) {
    return {}
  }

  return electronModule
}

export function createLocalMediaUrl(filePath: string): string {
  return `${LOCAL_MEDIA_SCHEME}://media?path=${encodeURIComponent(path.resolve(filePath))}`
}

export function configureLocalMediaRootsResolver(resolver: () => string[]): void {
  localMediaRootsResolver = resolver
}

export function buildLocalMediaFetchInit(request: Request): {
  headers: Headers
  method: string
} {
  return {
    headers: request.headers,
    method: request.method
  }
}

function inferLocalMediaContentType(filePath: string): string {
  switch (path.extname(filePath).toLocaleLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.flac':
      return 'audio/flac'
    case '.m4a':
      return 'audio/mp4'
    case '.ogg':
    case '.opus':
      return 'audio/ogg'
    case '.wav':
      return 'audio/wav'
    case '.aac':
      return 'audio/aac'
    case '.ape':
      return 'audio/ape'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function parseByteRange(
  rangeHeader: string | null,
  fileSize: number
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null
  }

  const matched = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!matched) {
    return null
  }

  const rawStart = matched[1]
  const rawEnd = matched[2]

  if (rawStart === '' && rawEnd === '') {
    return null
  }

  if (rawStart === '') {
    const suffixLength = Number.parseInt(rawEnd ?? '0', 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null
    }

    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1
    }
  }

  const start = Number.parseInt(rawStart, 10)
  const requestedEnd = rawEnd && rawEnd.length > 0 ? Number.parseInt(rawEnd, 10) : fileSize - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1)
  }
}

async function openValidatedLocalMediaFile(
  filePath: string
): Promise<{ handle: FileHandle; fileSize: number } | null> {
  const flags =
    fsConstants.O_RDONLY | (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)

  let handle: FileHandle | null = null
  try {
    handle = await open(filePath, flags)
    const stat = await handle.stat()
    const resolvedPath = resolveRealPath(filePath)

    if (!resolvedPath || resolvedPath !== filePath || !stat.isFile()) {
      await handle.close()
      return null
    }

    return {
      handle,
      fileSize: stat.size
    }
  } catch {
    if (handle) {
      await handle.close().catch(() => {})
    }
    return null
  }
}

async function createLocalMediaResponse(filePath: string, request: Request): Promise<Response> {
  const openedFile = await openValidatedLocalMediaFile(filePath)
  if (!openedFile) {
    return new Response('Unauthorized local media path', {
      status: 403
    })
  }

  const { handle, fileSize } = openedFile
  const byteRange = parseByteRange(request.headers.get('range'), fileSize)
  const stream = handle.createReadStream(
    byteRange
      ? {
          start: byteRange.start,
          end: byteRange.end
        }
      : undefined
  )
  const closeHandle = () => {
    void handle.close().catch(() => {})
  }
  stream.once('close', closeHandle)
  stream.once('error', closeHandle)

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': inferLocalMediaContentType(filePath)
  })

  if (byteRange) {
    const contentLength = byteRange.end - byteRange.start + 1
    headers.set('Content-Length', String(contentLength))
    headers.set('Content-Range', `bytes ${byteRange.start}-${byteRange.end}/${fileSize}`)

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers
    })
  }

  headers.set('Content-Length', String(fileSize))
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers
  })
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

function isAllowedLocalMediaFile(filePath: string): boolean {
  return ALLOWED_LOCAL_MEDIA_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())
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

    if (!isAllowedLocalMediaFile(resolvedFilePath)) {
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

export function registerLocalMediaProtocol(
  electronModule: ElectronLocalMediaProtocolModule = getElectronProtocolModule()
): void {
  if (localMediaProtocolRegistered) {
    return
  }

  const { protocol } = electronModule
  if (!protocol?.handle) {
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
      return await createLocalMediaResponse(filePath, request)
    } catch {
      return new Response('Failed to read local media file', {
        status: 500
      })
    }
  })

  localMediaProtocolRegistered = true
}
