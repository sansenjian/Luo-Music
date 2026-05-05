import path from 'node:path'
import { constants as fsConstants, realpathSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { LOCAL_MEDIA_SCHEME } from './protocol.privileged'

let localMediaProtocolRegistered = false
let localMediaRootsResolver: () => string[] = () => []
const LOCAL_MEDIA_HOST = 'media'
const REMOTE_MEDIA_HOST = 'remote'
const REMOTE_MEDIA_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
  net?: {
    fetch?: (url: string, init?: RequestInit) => Promise<Response>
  }
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
  return `${LOCAL_MEDIA_SCHEME}://${LOCAL_MEDIA_HOST}?path=${encodeURIComponent(path.resolve(filePath))}`
}

export function createRemoteMediaUrl(sourceUrl: string): string {
  return `${LOCAL_MEDIA_SCHEME}://${REMOTE_MEDIA_HOST}?url=${encodeURIComponent(sourceUrl)}`
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

export function buildRemoteMediaFetchInit(request: Request): RequestInit {
  const headers = new Headers()
  const range = request.headers.get('range')
  const accept = request.headers.get('accept') || '*/*'

  if (range) {
    headers.set('Range', range)
  }

  headers.set('Accept', accept)
  headers.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
  headers.set('User-Agent', REMOTE_MEDIA_USER_AGENT)

  return {
    headers,
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    redirect: 'follow'
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

function inferRemoteMediaContentType(sourceUrl: string): string {
  try {
    const parsedUrl = new URL(sourceUrl)
    switch (path.extname(parsedUrl.pathname).toLocaleLowerCase()) {
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
      default:
        return 'application/octet-stream'
    }
  } catch {
    return 'application/octet-stream'
  }
}

function appendRemoteMediaAccessHeaders(headers: Headers): Headers {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Headers', 'Range, Accept, Content-Type')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  headers.set('Timing-Allow-Origin', '*')
  return headers
}

function isBlockedRemoteMediaHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLocaleLowerCase()

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]'
  ) {
    return true
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalizedHostname)
  if (!ipv4Match) {
    return false
  }

  const octets = ipv4Match.slice(1).map(value => Number.parseInt(value, 10))
  if (octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return true
  }

  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
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

type RemoteMediaFetch = (url: string, init?: RequestInit) => Promise<Response>

async function createRemoteMediaResponse(
  sourceUrl: string,
  request: Request,
  fetchRemoteMedia: RemoteMediaFetch
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: appendRemoteMediaAccessHeaders(new Headers())
    })
  }

  const upstreamResponse = await fetchRemoteMedia(sourceUrl, buildRemoteMediaFetchInit(request))
  const headers = new Headers()
  const passthroughHeaders = [
    'accept-ranges',
    'cache-control',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified'
  ]

  for (const headerName of passthroughHeaders) {
    const value = upstreamResponse.headers.get(headerName)
    if (value) {
      headers.set(headerName, value)
    }
  }

  if (!headers.has('content-type')) {
    headers.set('Content-Type', inferRemoteMediaContentType(sourceUrl))
  }

  if (!headers.has('accept-ranges')) {
    headers.set('Accept-Ranges', 'bytes')
  }

  appendRemoteMediaAccessHeaders(headers)

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
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
    if (parsedUrl.hostname !== LOCAL_MEDIA_HOST) {
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

function resolveRemoteRequestUrl(requestUrl: string): { sourceUrl: string | null; status: number } {
  try {
    const parsedUrl = new URL(requestUrl)
    if (parsedUrl.hostname !== REMOTE_MEDIA_HOST) {
      return {
        sourceUrl: null,
        status: 400
      }
    }

    const requestedUrl = parsedUrl.searchParams.get('url')
    if (!requestedUrl) {
      return {
        sourceUrl: null,
        status: 400
      }
    }

    const sourceUrl = new URL(requestedUrl)
    if (
      (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') ||
      isBlockedRemoteMediaHostname(sourceUrl.hostname)
    ) {
      return {
        sourceUrl: null,
        status: 403
      }
    }

    return {
      sourceUrl: sourceUrl.href,
      status: 200
    }
  } catch {
    return {
      sourceUrl: null,
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
  const fetchRemoteMedia = electronModule.net?.fetch?.bind(electronModule.net) ?? fetch

  protocol.handle(LOCAL_MEDIA_SCHEME, async request => {
    let requestHost: string
    try {
      requestHost = new URL(request.url).hostname
    } catch {
      return new Response('Invalid media request', {
        status: 400
      })
    }

    if (requestHost === REMOTE_MEDIA_HOST) {
      const { sourceUrl, status } = resolveRemoteRequestUrl(request.url)
      if (!sourceUrl) {
        return new Response('Unauthorized remote media URL', {
          status,
          headers: appendRemoteMediaAccessHeaders(new Headers())
        })
      }

      try {
        return await createRemoteMediaResponse(sourceUrl, request, fetchRemoteMedia)
      } catch {
        return new Response('Failed to fetch remote media', {
          status: 502,
          headers: appendRemoteMediaAccessHeaders(new Headers())
        })
      }
    }

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
