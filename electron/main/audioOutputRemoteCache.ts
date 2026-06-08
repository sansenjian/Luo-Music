import { rm } from 'node:fs/promises'
import { extname } from 'node:path'
import { Transform } from 'node:stream'

import { LOCAL_MEDIA_SCHEME } from '../local-library/protocol.privileged'
import { buildRemoteMediaFetchInit, isBlockedRemoteMediaHostname } from '../local-library/protocol'

export type RemoteMediaContentRange = {
  start: number
  end: number
  totalBytes?: number
}

export const REMOTE_AUDIO_CACHE_MAX_BYTES = 512 * 1024 * 1024
export const REMOTE_AUDIO_RANGE_CHUNK_BYTES = 1024 * 1024

const REMOTE_MEDIA_PROXY_HOST = 'remote'
const REMOTE_AUDIO_CACHE_DELETE_RETRIES = 5
const REMOTE_AUDIO_CACHE_DELETE_RETRY_DELAY_MS = 50
const REMOTE_AUDIO_CACHE_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.ape',
  '.caf',
  '.flac',
  '.m2a',
  '.m4a',
  '.mka',
  '.mkv',
  '.mp1',
  '.mp2',
  '.mp3',
  '.mpa',
  '.oga',
  '.ogg',
  '.opus',
  '.wav'
])

export class RemoteMediaHttpStatusError extends Error {
  constructor(
    scope: string,
    readonly status: number
  ) {
    super(`${scope} failed with status ${status}`)
    this.name = 'RemoteMediaHttpStatusError'
  }
}

export function resolveRemoteAudioSourceUrl(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    const parsedUrl = new URL(value)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return normalizeRemoteHttpUrl(parsedUrl)
    }

    if (
      parsedUrl.protocol === `${LOCAL_MEDIA_SCHEME}:` &&
      parsedUrl.hostname === REMOTE_MEDIA_PROXY_HOST
    ) {
      const sourceUrl = parsedUrl.searchParams.get('url')
      if (!sourceUrl) {
        return null
      }

      const parsedSourceUrl = new URL(sourceUrl)
      if (parsedSourceUrl.protocol === 'http:' || parsedSourceUrl.protocol === 'https:') {
        return normalizeRemoteHttpUrl(parsedSourceUrl)
      }
    }
  } catch {
    return null
  }

  return null
}

export function createRemoteMediaRangeFetchInit(
  remoteUrl: string,
  start: number,
  end: number,
  signal: AbortSignal,
  requestHeaders?: Record<string, string>
): RequestInit {
  const rangeHeader = `bytes=${start}-${end}`
  const init = buildRemoteMediaFetchInit(
    new Request(remoteUrl, {
      headers: {
        Range: rangeHeader
      }
    })
  )
  const headers = new Headers(init.headers)

  if (requestHeaders) {
    for (const [name, value] of Object.entries(requestHeaders)) {
      headers.set(name, value)
    }
  }

  headers.set('Range', rangeHeader)
  headers.set('Accept-Encoding', 'identity')

  return {
    ...init,
    headers,
    signal
  }
}

export function createRemoteMediaFetchInit(
  remoteUrl: string,
  signal: AbortSignal,
  requestHeaders?: Record<string, string>
): RequestInit {
  const init = buildRemoteMediaFetchInit(new Request(remoteUrl))
  const headers = new Headers(init.headers)

  if (requestHeaders) {
    for (const [name, value] of Object.entries(requestHeaders)) {
      headers.set(name, value)
    }
  }

  headers.set('Accept-Encoding', 'identity')

  return {
    ...init,
    headers,
    signal
  }
}

export function sanitizeRemoteRangeChunkBytes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return REMOTE_AUDIO_RANGE_CHUNK_BYTES
  }

  return Math.max(1, Math.min(REMOTE_AUDIO_CACHE_MAX_BYTES, Math.floor(value)))
}

export function parseHeaderByteSize(value: string | null): number | undefined {
  if (!/^\d+$/.test(value?.trim() ?? '')) {
    return undefined
  }

  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function parseContentRange(value: string | null): RemoteMediaContentRange | undefined {
  const matched = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value?.trim() ?? '')
  if (!matched) {
    return undefined
  }

  const start = parseHeaderByteSize(matched[1])
  const end = parseHeaderByteSize(matched[2])
  const totalBytes = matched[3] === '*' ? undefined : parseHeaderByteSize(matched[3])

  if (
    start === undefined ||
    end === undefined ||
    end < start ||
    (totalBytes !== undefined && end >= totalBytes)
  ) {
    return undefined
  }

  return {
    start,
    end,
    totalBytes
  }
}

export function resolveRemoteMediaRangeSupport(response: Response): boolean {
  const contentRange = response.headers.get('content-range')
  const acceptRanges = response.headers.get('accept-ranges')?.trim().toLocaleLowerCase()

  if (response.status === 206 || parseContentRange(contentRange)?.totalBytes !== undefined) {
    return true
  }

  return acceptRanges === 'bytes'
}

export function isRejectedRemoteMediaContentType(contentType: string | null): boolean {
  const normalizedContentType = normalizeRemoteMediaContentType(contentType)
  return (
    normalizedContentType.startsWith('text/') ||
    normalizedContentType === 'application/json' ||
    normalizedContentType.endsWith('+json') ||
    normalizedContentType === 'application/xml' ||
    normalizedContentType.endsWith('+xml')
  )
}

export function resolveRemoteAudioCacheExtension(
  remoteUrl: string,
  contentType: string | null
): string {
  try {
    const extension = extname(new URL(remoteUrl).pathname).toLocaleLowerCase()
    if (REMOTE_AUDIO_CACHE_EXTENSIONS.has(extension)) {
      return extension
    }
  } catch {
    // Fall through to content-type inference.
  }

  const normalizedContentType = normalizeRemoteMediaContentType(contentType)
  switch (normalizedContentType) {
    case 'audio/aac':
    case 'audio/aacp':
      return '.aac'
    case 'audio/ape':
    case 'audio/x-ape':
    case 'audio/monkeys-audio':
    case 'application/x-ape':
      return '.ape'
    case 'audio/aiff':
    case 'audio/x-aiff':
      return '.aiff'
    case 'audio/x-caf':
    case 'audio/caf':
      return '.caf'
    case 'audio/flac':
    case 'audio/x-flac':
      return '.flac'
    case 'audio/x-matroska':
    case 'video/x-matroska':
      return '.mka'
    case 'audio/mp4':
    case 'video/mp4':
      return '.m4a'
    case 'audio/mp1':
      return '.mp1'
    case 'audio/mp2':
      return '.mp2'
    case 'audio/mpeg':
    case 'audio/mp3':
      return '.mp3'
    case 'audio/mpa':
    case 'audio/x-mpa':
      return '.mpa'
    case 'audio/oga':
      return '.oga'
    case 'audio/ogg':
    case 'application/ogg':
      return '.ogg'
    case 'audio/opus':
      return '.opus'
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return '.wav'
    default:
      return '.bin'
  }
}

export function createByteLimitTransform(
  maxBytes: number,
  onProgress?: (bytesReceived: number) => void,
  initialBytes = 0
): Transform {
  let totalBytes = initialBytes

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        callback(new Error('remote media response exceeded the native playback cache limit'))
        return
      }

      onProgress?.(totalBytes)
      callback(null, chunk)
    }
  })
}

export async function removeRemotePlaybackCacheFile(filePath: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < REMOTE_AUDIO_CACHE_DELETE_RETRIES; attempt += 1) {
    try {
      await rm(filePath, { force: true })
      return
    } catch (error) {
      lastError = error
      if (attempt < REMOTE_AUDIO_CACHE_DELETE_RETRIES - 1) {
        await delay(REMOTE_AUDIO_CACHE_DELETE_RETRY_DELAY_MS)
      }
    }
  }

  throw lastError
}

function normalizeRemoteHttpUrl(url: URL): string | null {
  if (isBlockedRemoteMediaHostname(url.hostname)) {
    return null
  }

  return url.href
}

function normalizeRemoteMediaContentType(contentType: string | null): string {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLocaleLowerCase()
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
