/**
 * Netease Music - 网易云音乐第三方插件
 *
 * 提供搜索、播放地址、歌词、歌单详情等完整功能。
 * 需要搭配 NeteaseCloudMusicApi 服务端。
 */

import { normalizeSong, normalizePlaylist } from './normalize.mjs'

const AUDIO_BITRATE_MAP = {
  standard: 128000,
  higher: 192000,
  exhigh: 320000,
  lossless: 999000,
  hires: 999000
}

function getBitrate(level, fallback = 128000) {
  return AUDIO_BITRATE_MAP[level] ?? fallback
}

export default {
  async create(ctx) {
    const apiBase = (ctx.settings.apiBase || 'http://127.0.0.1:14532').replace(/\/+$/, '')
    const verbose = Boolean(ctx.settings.verboseLog)

    ctx.logger.info('Netease plugin initialized', { apiBase })

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
      async search({ keyword, limit = 30, page = 1 }) {
        const offset = (page - 1) * limit
        const data = await apiGet('/cloudsearch', {
          keywords: keyword,
          type: 1,
          limit,
          offset
        })

        const songs = data?.result?.songs
        if (!Array.isArray(songs)) {
          return { list: [], total: 0 }
        }

        return {
          list: songs.map(song => normalizeSong(song, ctx.platformId)),
          total: data.result.songCount || 0
        }
      },

      async getSongUrl({ id, options }) {
        const level =
          (typeof options === 'string' ? options : options?.level) ||
          ctx.settings.audioLevel ||
          'standard'

        try {
          const v1Data = await apiGet('/song/url/v1', {
            id,
            level,
            randomCNIP: true,
            timestamp: Date.now()
          })
          const v1Url = Array.isArray(v1Data?.data) ? v1Data.data[0]?.url : null
          if (v1Url) return v1Url
        } catch {
          // 回退到旧接口
        }

        const legacyData = await apiGet('/song/url', {
          id,
          br: getBitrate(level),
          randomCNIP: true,
          timestamp: Date.now()
        })

        const urls = Array.isArray(legacyData?.data) ? legacyData.data : []
        return urls[0]?.url ?? null
      },

      async getSongDetail({ id }) {
        const data = await apiGet('/song/detail', {
          ids: String(id),
          timestamp: Date.now()
        })

        if (!data) return null

        const songs = Array.isArray(data.songs) ? data.songs : Array.isArray(data) ? data : [data]

        return songs[0] ? normalizeSong(songs[0], ctx.platformId) : null
      },

      async getLyric({ id }) {
        const data = await apiGet('/lyric', {
          id,
          timestamp: Date.now()
        })

        if (!data) return { lrc: '', tlyric: '', romalrc: '' }

        const tlyric = typeof data.tlyric === 'string' ? data.tlyric : data.tlyric?.lyric || ''
        const romalrc = typeof data.romalrc === 'string' ? data.romalrc : data.romalrc?.lyric || ''

        return {
          lrc: data.lrc?.lyric || data.lyric || '',
          tlyric,
          romalrc
        }
      },

      async getPlaylistDetail({ id }) {
        const data = await apiGet('/playlist/detail', { id })

        if (!data?.playlist?.id) return null

        return normalizePlaylist(data.playlist, ctx.platformId)
      },

      async dispose() {
        ctx.logger.info('Netease plugin disposed')
      }
    }
  }
}
