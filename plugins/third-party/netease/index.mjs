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

function collectPayloads(response) {
  if (!response || typeof response !== 'object') return []

  const payloads = []
  for (const root of [response, response.body]) {
    let current = root
    let depth = 0

    while (current && typeof current === 'object' && depth < 4) {
      payloads.push(current)
      current = current.data
      depth += 1
    }
  }

  return payloads
}

function normalizeStringValue(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' && item.length > 0).join('; ')
  }
  return ''
}

function normalizeNumberLikeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function extractQrKey(response) {
  return normalizeStringValue(collectPayloads(response).find(payload => payload.unikey)?.unikey)
}

function extractQrImage(response) {
  return normalizeStringValue(collectPayloads(response).find(payload => payload.qrimg)?.qrimg)
}

function extractQrStatusCode(response) {
  for (const payload of collectPayloads(response)) {
    const code = normalizeNumberLikeValue(payload.code)
    if (code !== null) return code
  }
  return null
}

function extractQrCookie(response) {
  for (const payload of collectPayloads(response)) {
    const cookie = normalizeStringValue(payload.cookie)
    if (cookie) return cookie
  }
  return ''
}

function extractUserProfile(response) {
  for (const payload of collectPayloads(response)) {
    if (payload.profile && typeof payload.profile === 'object') {
      return payload.profile
    }
  }
  return null
}

function extractUserId(response) {
  for (const payload of collectPayloads(response)) {
    const profileUserId =
      payload.profile && typeof payload.profile === 'object'
        ? normalizeNumberLikeValue(payload.profile.userId)
        : null
    if (profileUserId !== null) return profileUserId

    const accountId =
      payload.account && typeof payload.account === 'object'
        ? normalizeNumberLikeValue(payload.account.id)
        : null
    if (accountId !== null) return accountId
  }

  return null
}

function normalizeAccountProfile(profile) {
  if (!profile || typeof profile !== 'object') return undefined

  const id = profile.userId ?? profile.id
  const nickname = profile.nickname || profile.name
  if (id === undefined || id === null || !nickname) return undefined

  return {
    id,
    nickname: String(nickname),
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
    homepageUrl:
      profile.userId !== undefined && profile.userId !== null
        ? `https://music.163.com/#/user/home?id=${profile.userId}`
        : undefined
  }
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

    async function getAuthState() {
      const cookie = normalizeStringValue(await ctx.secrets.get('cookie'))
      const account = normalizeAccountProfile(await ctx.secrets.get('account'))

      return {
        platform: ctx.platformId,
        status: cookie ? 'authenticated' : 'anonymous',
        account,
        message: cookie ? '已登录' : '未登录'
      }
    }

    async function fetchAccountProfile(cookie) {
      const accountRes = await apiGet('/user/account', {
        cookie,
        timestamp: Date.now()
      })

      let profile = extractUserProfile(accountRes)
      if (!profile) {
        const userId = extractUserId(accountRes)
        if (userId !== null) {
          const detailRes = await apiGet('/user/detail', {
            uid: userId,
            cookie,
            timestamp: Date.now()
          })
          profile = extractUserProfile(detailRes)
        }
      }

      return normalizeAccountProfile(profile)
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

      'auth.getState': getAuthState,

      async 'auth.startLogin'() {
        const keyRes = await apiGet('/login/qr/key', {
          timestamp: Date.now()
        })
        const challengeId = extractQrKey(keyRes)
        if (!challengeId) {
          throw new Error('Missing Netease QR login key')
        }

        const qrRes = await apiGet('/login/qr/create', {
          key: challengeId,
          qrimg: true,
          timestamp: Date.now()
        })
        const qrImageUrl = extractQrImage(qrRes)
        if (!qrImageUrl) {
          throw new Error('Missing Netease QR image')
        }

        return {
          challengeId,
          type: 'qr',
          title: '网易云登录',
          statusText: '请使用网易云音乐 App 扫码登录',
          qrImageUrl,
          pollIntervalMs: 3000,
          canRefresh: true,
          cancelable: true
        }
      },

      async 'auth.pollLogin'({ challengeId }) {
        if (!challengeId) {
          return {
            platform: ctx.platformId,
            status: 'error',
            message: '登录参数缺失'
          }
        }

        const data = await apiGet('/login/qr/check', {
          key: challengeId,
          timestamp: Date.now()
        })
        const statusCode = extractQrStatusCode(data)

        if (statusCode === 800) {
          return {
            platform: ctx.platformId,
            status: 'expired',
            message: '二维码已过期，请刷新后重新扫码'
          }
        }

        if (statusCode === 802) {
          return {
            platform: ctx.platformId,
            status: 'pending',
            message: '已扫码，请在手机上确认登录'
          }
        }

        if (statusCode !== 803) {
          return {
            platform: ctx.platformId,
            status: 'pending',
            message: '请使用网易云音乐 App 扫码登录'
          }
        }

        const cookie = extractQrCookie(data)
        if (!cookie) {
          return {
            platform: ctx.platformId,
            status: 'error',
            message: '登录成功但未返回会话'
          }
        }

        await ctx.secrets.set('cookie', cookie)

        let account
        try {
          account = await fetchAccountProfile(cookie)
          if (account) {
            await ctx.secrets.set('account', account)
          }
        } catch (error) {
          ctx.logger.warn('Failed to fetch Netease account profile after login', { error })
        }

        return {
          platform: ctx.platformId,
          status: 'authenticated',
          account,
          message: '登录成功'
        }
      },

      async 'auth.cancelLogin'() {
        return null
      },

      async 'auth.refresh'() {
        return getAuthState()
      },

      async 'auth.logout'() {
        await ctx.secrets.remove('cookie')
        await ctx.secrets.remove('account')

        return {
          platform: ctx.platformId,
          status: 'anonymous',
          message: '已退出登录'
        }
      },

      async dispose() {
        ctx.logger.info('Netease plugin disposed')
      }
    }
  }
}
