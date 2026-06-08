import { isLocalLibrarySong } from '@shared/types/localLibrary'
import type { Song } from '@shared/types/schemas'

const REMOTE_MEDIA_PROXY_SCHEME = 'luo-media'
const LOCAL_MEDIA_PROXY_HOST = 'media'
const REMOTE_MEDIA_PROXY_HOST = 'remote'

export function createLocalMediaUrl(filePath: string): string {
  return `${REMOTE_MEDIA_PROXY_SCHEME}://${LOCAL_MEDIA_PROXY_HOST}?path=${encodeURIComponent(
    filePath
  )}`
}

export function resolveLocalLibraryPlaybackUrl(song: Song): string | null {
  if (!isLocalLibrarySong(song)) {
    return null
  }

  if (song.url) {
    return song.url
  }

  const localFilePath = (song.extra as Record<string, unknown> | undefined)?.localFilePath
  if (typeof localFilePath !== 'string' || !localFilePath.trim()) {
    return null
  }

  return createLocalMediaUrl(localFilePath.trim())
}

export function createRemoteMediaProxyUrl(sourceUrl: string): string {
  return `${REMOTE_MEDIA_PROXY_SCHEME}://${REMOTE_MEDIA_PROXY_HOST}?url=${encodeURIComponent(
    sourceUrl
  )}`
}

export function isRemoteMediaProxyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === `${REMOTE_MEDIA_PROXY_SCHEME}:` && url.hostname === REMOTE_MEDIA_PROXY_HOST
    )
  } catch {
    return false
  }
}

export function shouldProxyRemoteMediaUrl(value: string, isElectron: boolean): boolean {
  if (!isElectron || isRemoteMediaProxyUrl(value)) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function resolvePlaybackMediaUrl(value: string, isElectron: boolean): string {
  return shouldProxyRemoteMediaUrl(value, isElectron) ? createRemoteMediaProxyUrl(value) : value
}
