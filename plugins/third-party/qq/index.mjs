/**
 * QQ Music - QQ 音乐第三方插件
 *
 * 提供搜索、播放地址、歌词等功能。
 * 需要搭配 QQMusicApi 服务端。
 */

import { normalizeSong } from './normalize.mjs'

class PluginCallError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'PluginCallError'
    this.code = code
    this.retryable = Boolean(options.retryable)
    this.userMessage = options.userMessage
    this.details = options.details
  }
}

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

function createSongUrlResult(url, options = {}) {
  if (!url) return { url: null }

  return {
    url,
    ...(options.mediaId ? { mediaId: options.mediaId } : {}),
    level: 'unknown'
  }
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

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeAccountProfile(profile) {
  if (!isRecord(profile)) return undefined

  const id = profile.uin || profile.id || profile.qq || profile.uid
  const nickname = profile.nick || profile.nickname || profile.name
  if (id === undefined || id === null || !nickname) return undefined

  return {
    id,
    nickname: String(nickname),
    avatarUrl: normalizeString(profile.headurl || profile.avatarUrl || profile.avatar)
  }
}

function extractSessionCookie(payload) {
  if (!isRecord(payload)) return ''

  return normalizeString(
    payload.session?.cookie ||
      payload.data?.session?.cookie ||
      payload.body?.session?.cookie ||
      payload.body?.data?.cookie ||
      payload.cookie
  )
}

function normalizeImportedSession(input) {
  const session = isRecord(input) ? input.session : null
  if (!isRecord(session)) return null

  const credential = isRecord(session.credential) ? session.credential : null
  const credentialType = credential?.type
  const credentialValue = normalizeString(credential?.value).trim()
  if (credentialType !== 'cookie' || !credentialValue) return null

  return {
    cookie: credentialValue,
    account: normalizeAccountProfile(session.account)
  }
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

    async function apiPost(endpoint, body, params) {
      const url = new URL(endpoint, apiBase)
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value))
          }
        }
      }
      if (verbose) {
        ctx.logger.debug('API POST', { endpoint, params: Object.keys(params || {}) })
      }
      return ctx.http.post(url.href, body)
    }

    async function getAuthState() {
      const cookie = normalizeString(await ctx.secrets.get('cookie'))
      const account = normalizeAccountProfile(await ctx.secrets.get('account'))

      if (!cookie) {
        if (account) {
          await ctx.secrets.remove('account')
        }

        return {
          platform: ctx.platformId,
          status: 'anonymous',
          message: '未登录'
        }
      }

      return {
        platform: ctx.platformId,
        status: 'authenticated',
        ...(account ? { account } : {}),
        message: '已登录'
      }
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
          return createSongUrlResult(null)
        }

        const url = resolvePlayableUrl(data, id)
        if (!url) {
          ctx.logger.warn('getSongUrl empty playUrl', { id, mediaId })
        }
        return createSongUrlResult(url, { mediaId })
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
        throw new PluginCallError('UNSUPPORTED_OPERATION', 'QQ playlist detail is not supported', {
          retryable: false,
          userMessage: 'QQ 音乐插件暂不支持歌单详情'
        })
      },

      async 'account.getProfile'() {
        return normalizeAccountProfile(await ctx.secrets.get('account')) || null
      },

      'auth.getState': getAuthState,

      async 'auth.startLogin'() {
        const data = unwrapQQResponse(await apiGet('/user/getQQLoginQr'))
        const payload = data?.body || data

        if (!payload?.img || !payload.ptqrtoken || !payload.qrsig) {
          throw new Error('Missing QQ login QR payload')
        }

        const challengeId = `qq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await ctx.storage.set(`auth:${challengeId}`, {
          ptqrtoken: String(payload.ptqrtoken),
          qrsig: String(payload.qrsig)
        })

        return {
          challengeId,
          type: 'qr',
          title: 'QQ 音乐登录',
          statusText: '请使用 QQ 音乐 App 扫码登录',
          qrImageUrl: String(payload.img),
          pollIntervalMs: 2000,
          canRefresh: true,
          cancelable: true
        }
      },

      async 'auth.pollLogin'({ challengeId }) {
        const challenge = await ctx.storage.get(`auth:${challengeId}`)
        if (!isRecord(challenge)) {
          return {
            platform: ctx.platformId,
            status: 'error',
            message: '登录参数已失效，请刷新二维码'
          }
        }

        const data = unwrapQQResponse(
          await apiPost('/user/checkQQLoginQr', null, {
            ptqrtoken: challenge.ptqrtoken,
            qrsig: challenge.qrsig
          })
        )

        if (data?.isOk) {
          const cookie = extractSessionCookie(data)
          if (!cookie) {
            return {
              platform: ctx.platformId,
              status: 'error',
              message: '登录成功但未返回会话'
            }
          }

          await ctx.secrets.set('cookie', cookie)
          const account = normalizeAccountProfile(data?.user || data?.profile || data?.creator)
          if (account) {
            await ctx.secrets.set('account', account)
          } else {
            await ctx.secrets.remove('account')
          }
          await ctx.storage.remove(`auth:${challengeId}`)

          return {
            platform: ctx.platformId,
            status: 'authenticated',
            ...(account ? { account } : {}),
            message: '登录成功'
          }
        }

        if (data?.refresh) {
          await ctx.storage.remove(`auth:${challengeId}`)

          return {
            platform: ctx.platformId,
            status: 'expired',
            message: '二维码已过期，请刷新后重试'
          }
        }

        return {
          platform: ctx.platformId,
          status: 'pending',
          message: data?.message || '请使用 QQ 音乐 App 扫码登录'
        }
      },

      async 'auth.cancelLogin'({ challengeId } = {}) {
        if (challengeId) {
          await ctx.storage.remove(`auth:${challengeId}`)
        }
        return null
      },

      async 'auth.importSession'(input) {
        const session = normalizeImportedSession(input)
        if (!session) {
          return {
            platform: ctx.platformId,
            status: 'error',
            message: '导入的登录会话无效'
          }
        }

        await ctx.secrets.set('cookie', session.cookie)
        if (session.account) {
          await ctx.secrets.set('account', session.account)
        } else {
          await ctx.secrets.remove('account')
        }

        return {
          platform: ctx.platformId,
          status: 'authenticated',
          ...(session.account ? { account: session.account } : {}),
          message: '登录会话已导入'
        }
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
        ctx.logger.info('QQ Music plugin disposed')
      }
    }
  }
}
