/**
 * QQ Music - QQ 音乐第三方插件
 *
 * 提供搜索、播放地址、歌词等功能。
 * 需要搭配 QQMusicApi 服务端。
 */

import { normalizeSong } from './normalize.mjs'

function normalizeLyricText(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const lyric = value.lyric
    if (typeof lyric === 'string') return lyric
  }
  return ''
}

function resolvePlayableUrl(playData, songId) {
  if (!playData) return null

  if (typeof playData.url === 'string' && playData.url.length > 0) {
    return playData.url
  }

  if (!playData.playUrl) return null

  const playKey = String(songId)
  const value = playData.playUrl[playKey] ?? playData.playUrl[Object.keys(playData.playUrl)[0]]
  if (!value) return null

  if (typeof value === 'string') return value || null
  if (typeof value.url === 'string' && value.url.length > 0) return value.url

  return null
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function unwrapQQResponse(value) {
  const parsed = parseMaybeJson(value)
  if (!isRecord(parsed)) return parsed

  if ('response' in parsed) {
    const response = parseMaybeJson(parsed.response)
    if (isRecord(response)) return response
  }

  if (isRecord(parsed.data)) return parsed.data
  if (isRecord(parsed.result)) return parsed.result

  return parsed
}

function resolveSearchPayload(value) {
  const payload = unwrapQQResponse(value)
  if (!isRecord(payload)) return null

  if (isRecord(payload.song)) {
    return payload
  }

  const requestData = isRecord(payload.req) && isRecord(payload.req.data) ? payload.req.data : null
  const song = requestData && isRecord(requestData.body) ? requestData.body.song : null
  if (!isRecord(song)) {
    return payload
  }

  return {
    song: {
      list: song.list,
      totalnum: requestData.meta?.sum
    }
  }
}

export default {
  async create(ctx) {
    const apiBase = (ctx.settings.apiBase || 'http://127.0.0.1:3200').replace(/\/+$/, '')
    const verbose = Boolean(ctx.settings.verboseLog)

    ctx.logger.info('QQ Music plugin initialized', { apiBase })

    async function apiGet(endpoint, params) {
      const url = new URL(endpoint, apiBase)
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value))
          }
        }
      }
      if (verbose) {
        ctx.logger.debug('API GET', { endpoint, params: Object.keys(params || {}) })
      }
      return ctx.http.get(url.href)
    }

    return {
      async search({ keyword, limit = 20, page = 1 }) {
        const data = resolveSearchPayload(
          await apiGet('/getSearchByKey', {
            key: keyword,
            limit,
            page
          })
        )

        if (!data?.song?.list || !Array.isArray(data.song.list)) {
          return { list: [], total: 0 }
        }

        return {
          list: data.song.list.map(song => normalizeSong(song, ctx.platformId)),
          total: data.song.totalnum || data.song.list.length
        }
      },

      async getSongUrl({ id, options }) {
        let mediaId
        if (options && typeof options === 'object') {
          mediaId = options.mediaId
        }

        if (!mediaId) {
          try {
            const songInfo = unwrapQQResponse(await apiGet(`/getSongInfo/${id}`))
            if (songInfo?.track_info) {
              mediaId =
                songInfo.track_info.strMediaMid ||
                songInfo.track_info.file?.media_mid ||
                songInfo.track_info.mid
            }
          } catch {
            ctx.logger.warn('getSongUrl: failed to fetch song info', { id })
          }
        }

        const data = unwrapQQResponse(
          await apiGet('/getMusicPlay', {
            songmid: id,
            mediaId,
            resType: 'play'
          })
        )

        if (!data) {
          ctx.logger.warn('getSongUrl failed', { id, mediaId })
          return null
        }

        const url = resolvePlayableUrl(data, id)
        if (!url) {
          ctx.logger.warn('getSongUrl empty playUrl', { id, mediaId })
        }
        return url
      },

      async getSongDetail({ id }) {
        const data = unwrapQQResponse(await apiGet(`/getSongInfo/${id}`))
        return data?.track_info ? normalizeSong(data.track_info, ctx.platformId) : null
      },

      async getLyric({ id }) {
        const data = unwrapQQResponse(await apiGet('/getLyric', { songmid: id }))

        if (!data) return { lrc: '', tlyric: '', romalrc: '' }

        return {
          lrc: normalizeLyricText(data.lyric),
          tlyric: normalizeLyricText(data.tlyric ?? data.trans),
          romalrc: normalizeLyricText(data.romalrc)
        }
      },

      async getPlaylistDetail() {
        return null
      },

      async dispose() {
        ctx.logger.info('QQ Music plugin disposed')
      }
    }
  }
}
