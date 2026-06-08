import type { Song } from '@shared/types/schemas'
import {
  getSongUrlHeaders,
  getSongUrlValue,
  type SongUrlHeaders,
  type SongUrlResult
} from '@/platform/music/interface'

export const NATIVE_AUDIO_OUTPUT_REQUEST_HEADERS_EXTRA_KEY = 'nativeAudioOutputRequestHeaders'

function cloneHeaders(headers: SongUrlHeaders | undefined): SongUrlHeaders | undefined {
  if (!headers || Object.keys(headers).length === 0) {
    return undefined
  }

  return { ...headers }
}

export function setSongNativeAudioOutputRequestHeaders(
  song: Song,
  headers: SongUrlHeaders | undefined
): void {
  const nextHeaders = cloneHeaders(headers)
  const currentExtra = song.extra

  if (nextHeaders) {
    song.extra = {
      ...currentExtra,
      [NATIVE_AUDIO_OUTPUT_REQUEST_HEADERS_EXTRA_KEY]: nextHeaders
    }
    return
  }

  if (!currentExtra || !(NATIVE_AUDIO_OUTPUT_REQUEST_HEADERS_EXTRA_KEY in currentExtra)) {
    return
  }

  const nextExtra = { ...currentExtra }
  delete nextExtra[NATIVE_AUDIO_OUTPUT_REQUEST_HEADERS_EXTRA_KEY]
  song.extra = Object.keys(nextExtra).length > 0 ? nextExtra : undefined
}

export function getSongNativeAudioOutputRequestHeaders(song: Song): SongUrlHeaders | undefined {
  const value = song.extra?.[NATIVE_AUDIO_OUTPUT_REQUEST_HEADERS_EXTRA_KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const headers = Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' &&
        entry[0].trim().length > 0 &&
        typeof entry[1] === 'string' &&
        entry[1].trim().length > 0
    )
  )

  return Object.keys(headers).length > 0 ? headers : undefined
}

export function applySongUrlResultToSong(
  song: Song,
  result: SongUrlResult | null | undefined
): string | null {
  const url = getSongUrlValue(result)
  if (!url) {
    return null
  }

  song.url = url
  setSongNativeAudioOutputRequestHeaders(song, getSongUrlHeaders(result))
  return url
}
