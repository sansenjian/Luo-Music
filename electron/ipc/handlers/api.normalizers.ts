import { getNeteaseSearchType } from '../../../src/platform/music/netease.constants'
import { DEFAULT_AUDIO_BITRATE } from '../../../src/constants/audio'
import type { MusicPlatform } from './api.contract'

function mapQualityToBitrate(quality?: number): number {
  if (typeof quality === 'number' && Number.isFinite(quality) && quality > 0) {
    return quality
  }

  return DEFAULT_AUDIO_BITRATE
}

export function extractSongUrl(
  platform: MusicPlatform,
  id: string | number,
  response: unknown
): { url: string } {
  if (platform === 'qq') {
    if (response && typeof response === 'object') {
      const directUrl = (response as { url?: unknown }).url
      if (typeof directUrl === 'string' && directUrl.length > 0) {
        return { url: directUrl }
      }

      const playUrl = (response as { playUrl?: Record<string, unknown> }).playUrl
      if (playUrl && typeof playUrl === 'object') {
        const resolved = playUrl[String(id)] ?? playUrl[Object.keys(playUrl)[0] ?? '']
        if (typeof resolved === 'string' && resolved.length > 0) {
          return { url: resolved }
        }
        if (resolved && typeof resolved === 'object') {
          const nestedUrl = (resolved as { url?: unknown }).url
          if (typeof nestedUrl === 'string' && nestedUrl.length > 0) {
            return { url: nestedUrl }
          }
        }
      }
    }

    return { url: '' }
  }

  const data = response && typeof response === 'object' ? (response as { data?: unknown }).data : []
  const items = Array.isArray(data) ? data : []
  const url = items[0] && typeof items[0] === 'object' ? (items[0] as { url?: unknown }).url : ''
  return { url: typeof url === 'string' ? url : '' }
}

export function normalizeLyricResponse(platform: MusicPlatform, response: unknown) {
  if (!response || typeof response !== 'object') {
    return { lyric: '', translated: '', romalrc: '' }
  }

  if (platform === 'qq') {
    const qqResponse = response as {
      lyric?: unknown
      tlyric?: unknown
      trans?: unknown
      romalrc?: unknown
    }

    const normalizeQQLyricText = (value: unknown): string => {
      if (typeof value === 'string') {
        return value
      }

      if (value && typeof value === 'object') {
        const lyric = (value as { lyric?: unknown }).lyric
        if (typeof lyric === 'string') {
          return lyric
        }
      }

      return ''
    }

    return {
      lyric: normalizeQQLyricText(qqResponse.lyric),
      translated: normalizeQQLyricText(qqResponse.tlyric ?? qqResponse.trans),
      romalrc: normalizeQQLyricText(qqResponse.romalrc)
    }
  }

  const neteaseResponse = response as {
    lyric?: unknown
    lrc?: { lyric?: unknown }
    tlyric?: string | { lyric?: unknown }
    romalrc?: string | { lyric?: unknown }
  }

  const translated =
    typeof neteaseResponse.tlyric === 'string'
      ? neteaseResponse.tlyric
      : typeof neteaseResponse.tlyric?.lyric === 'string'
        ? neteaseResponse.tlyric.lyric
        : ''

  const romalrc =
    typeof neteaseResponse.romalrc === 'string'
      ? neteaseResponse.romalrc
      : typeof neteaseResponse.romalrc?.lyric === 'string'
        ? neteaseResponse.romalrc.lyric
        : ''

  return {
    lyric:
      typeof neteaseResponse.lyric === 'string'
        ? neteaseResponse.lyric
        : typeof neteaseResponse.lrc?.lyric === 'string'
          ? neteaseResponse.lrc.lyric
          : '',
    translated,
    romalrc
  }
}

export function getSearchTarget(
  platform: MusicPlatform,
  keyword: string,
  type?: string,
  page = 1,
  limit = 30
) {
  if (platform === 'qq') {
    return {
      endpoint: 'getSearchByKey',
      params: {
        key: keyword,
        type,
        page,
        limit
      }
    }
  }

  return {
    endpoint: 'cloudsearch',
    params: {
      keywords: keyword,
      type: getNeteaseSearchType(type),
      limit,
      offset: Math.max(page - 1, 0) * limit
    }
  }
}

export function resolveSongUrlFallbackBitrate(quality?: number): number {
  return mapQualityToBitrate(quality)
}
