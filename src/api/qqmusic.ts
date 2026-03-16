import axios from 'axios'
import { QQMusicAdapter } from './adapter'
import { services } from '../services'
import type { ILogger } from '../services/loggerService'
import { useUserStore } from '../store/userStore'

const DEFAULT_QQ_MUSIC_BASE_URL = '/qq-api'
const isElectronRenderer = () =>
  typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron')

let cachedQQBaseURL: string | null = null
let resolvingQQBaseURL: Promise<string> | null = null
let cachedQQCookie: string | null = null
let lastQQCookieCheck = 0

const QQ_COOKIE_CACHE_TTL = 5000
const QQ_LOGIN_CHECK_PATH = '/user/getCookie'

// 懒加载 logger，避免循环依赖
let _logger: ILogger | undefined
function getLogger() {
  if (_logger === undefined) {
    _logger = services.logger().createLogger('qqMusicApi')
  }
  return _logger
}

function getQQCookie(): string | null {
  const now = Date.now()
  if (cachedQQCookie !== null && now - lastQQCookieCheck < QQ_COOKIE_CACHE_TTL) {
    return cachedQQCookie
  }

  try {
    const userStore = useUserStore()
    cachedQQCookie = userStore.qqCookie || null
  } catch {
    cachedQQCookie = null
  }

  lastQQCookieCheck = now
  return cachedQQCookie
}

async function resolveQQMusicBaseURL(): Promise<string> {
  if (!isElectronRenderer() || !import.meta.env.PROD) {
    return DEFAULT_QQ_MUSIC_BASE_URL
  }

  if (cachedQQBaseURL) {
    return cachedQQBaseURL
  }

  if (!resolvingQQBaseURL) {
    resolvingQQBaseURL = (async () => {
      try {
        const platformService = services.platform()
        const status = await platformService.getServiceStatus?.('qq')
        const port = typeof status?.port === 'number' ? status.port : null
        if (port) {
          cachedQQBaseURL = `http://localhost:${port}`
          return cachedQQBaseURL
        }
      } catch {
        // ignore and fall back
      }

      cachedQQBaseURL = 'http://localhost:3200'
      return cachedQQBaseURL
    })()
  }

  return resolvingQQBaseURL
}

// 开发模式下的调试日志
if (import.meta.env.DEV) {
}

export interface QQApiWrappedResponse<T> {
  response?: string | T
  data?: T
  code?: number
  result?: number
}

export interface QQSearchSongItem {
  songmid?: string
  songid?: string | number
  songname?: string
  singer?: Array<{ mid?: string | number; name?: string }>
  albummid?: string
  albumname?: string
  interval?: number
  vid?: string | number
  strMediaMid?: string
  file?: {
    media_mid?: string
  }
}

export interface QQSearchData {
  song?: {
    list?: QQSearchSongItem[]
    totalnum?: number
  }
}

export interface QQSongInfoTrack {
  mid?: string
  id?: string | number
  name?: string
  title?: string
  singer?: Array<{ mid?: string | number; name?: string }>
  album?: {
    mid?: string | number
    name?: string
  }
  albummid?: string | number
  albumname?: string
  interval?: number
  vid?: string | number
  songid?: string | number
  strMediaMid?: string
  file?: {
    media_mid?: string
  }
}

export interface QQSongInfoData {
  track_info?: QQSongInfoTrack
}

export interface QQMusicPlayEntry {
  url?: string
  error?: string
}

export interface QQMusicPlayData {
  url?: string
  playUrl?: Record<string, QQMusicPlayEntry | string>
}

export interface QQLyricPayload {
  lyric?:
    | string
    | {
        lyric?: string
      }
  trans?: string
  tlyric?:
    | string
    | {
        lyric?: string
      }
  romalrc?:
    | string
    | {
        lyric?: string
      }
}

export type QQSearchResponse = QQApiWrappedResponse<QQSearchData>
export type QQSongInfoResponse = QQApiWrappedResponse<QQSongInfoData>
export type QQMusicPlayResponse = QQApiWrappedResponse<QQMusicPlayData>
export type QQLyricResponse = QQApiWrappedResponse<QQLyricPayload>

const qqRequest = axios.create({
  baseURL: DEFAULT_QQ_MUSIC_BASE_URL,
  timeout: 30000
})

qqRequest.interceptors.request.use(async config => {
  if (isElectronRenderer() && import.meta.env.PROD) {
    config.baseURL = await resolveQQMusicBaseURL()
  }

  const cookie = getQQCookie()
  if (cookie) {
    const params =
      config.params && typeof config.params === 'object'
        ? (config.params as Record<string, unknown>)
        : {}

    if (typeof params.cookie !== 'string' || params.cookie.length === 0) {
      params.cookie = cookie
    }
    config.params = params

    config.headers = config.headers || {}
    if (!('X-Custom-Cookie' in config.headers) && !('x-custom-cookie' in config.headers)) {
      config.headers['X-Custom-Cookie'] = cookie
    }
  }

  return config
})

qqRequest.interceptors.response.use(
  response => {
    if (response && response.data) {
      return response.data
    }
    return response
  },
  error => {
    const requestUrl =
      typeof error?.config?.url === 'string' ? error.config.url : String(error?.config?.url ?? '')

    // 检查是否是 QQ 登录验证请求
    const isQQLoginCheck = requestUrl.includes(QQ_LOGIN_CHECK_PATH)

    // 对于 QQ 登录检查，静默处理网络错误和超时
    if (isQQLoginCheck && (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ERR_NETWORK' ||
      !error.response
    )) {
      getLogger().debug('QQ login check network error, ignoring', {
        url: requestUrl,
        code: error.code,
        message: error.message
      })
      // 返回空响应，让 checkQQMusicLogin 处理
      return Promise.reject(error)
    }

    if (!isQQLoginCheck) {
      getLogger().error('QQ Music API request failed', {
        url: requestUrl,
        status: error?.response?.status,
        code: error?.code,
        message: error?.message
      })
    }

    if (error.code === 'ERR_NETWORK' || !error.response) {
      getLogger().warn('QQ Music API network request failed', {
        url: requestUrl,
        code: error?.code
      })
      console.warn('[QQMusic] 网络错误，请检查 QQ 音乐 API 服务是否正常运行')
      return Promise.reject(error)
    }
    return Promise.reject(error)
  }
)

export const qqMusicAdapter = new QQMusicAdapter(qqRequest)

export function clearQQCookieCache(): void {
  cachedQQCookie = null
  lastQQCookieCheck = 0
}

export const qqMusicApi = {
  search(keyword: string, limit: number = 20, page: number = 1) {
    return qqRequest.get<unknown, Promise<QQSearchResponse>>('/getSearchByKey', {
      params: {
        key: keyword,
        limit,
        page
      }
    })
  },

  getSmartbox(keyword: string) {
    return qqRequest.get(`/getSmartbox/${encodeURIComponent(keyword)}`)
  },

  getHotkey() {
    return qqRequest.get('/getHotkey')
  },

  getSongInfo(songmid: string | number, songid?: string | number) {
    return qqRequest.get<unknown, Promise<QQSongInfoResponse>>(
      `/getSongInfo/${songmid}/${songid || ''}`
    )
  },

  batchGetSongInfo(songmids: string[]) {
    return qqRequest.post('/batchGetSongInfo', { songmids })
  },

  getMusicPlay(
    songmid: string | number,
    mediaId?: string,
    quality: number = 128,
    resType: 'play' | 'all' = 'play'
  ) {
    return qqRequest.get<unknown, Promise<QQMusicPlayResponse>>('/getMusicPlay', {
      params: {
        songmid,
        mediaId,
        quality,
        resType
      }
    })
  },

  getLyric(songmid: string | number, isFormat: boolean = true) {
    return qqRequest.get<unknown, Promise<QQLyricResponse>>('/getLyric', {
      params: {
        songmid,
        isFormat: isFormat ? 1 : 0
      }
    })
  },

  getRecommend() {
    return qqRequest.get('/getRecommend')
  },

  getTopLists() {
    return qqRequest.get('/getTopLists')
  },

  getRanks(topId: string | number, limit: number = 100, page: number = 1) {
    return qqRequest.get(`/getRanks/${topId}/${limit}/${page}`)
  },

  getSongListCategories() {
    return qqRequest.get('/getSongListCategories')
  },

  getSongLists(
    page: number = 1,
    limit: number = 20,
    categoryId?: string | number,
    sortId?: string | number
  ) {
    return qqRequest.get(`/getSongLists/${page}/${limit}/${categoryId || ''}/${sortId || ''}`)
  },

  getSongListDetail(disstid: string) {
    return qqRequest.get(`/getSongListDetail/${disstid}`)
  },

  batchGetSongLists(disstids: string[]) {
    return qqRequest.post('/batchGetSongLists', { disstids })
  },

  getSingerList(
    area: number = -1,
    sex: number = -1,
    genre: number = -1,
    index: number = -1,
    page: number = 1
  ) {
    return qqRequest.get(`/getSingerList/${area}/${sex}/${genre}/${index}/${page}`)
  },

  getSimilarSinger(singermid: string) {
    return qqRequest.get(`/getSimilarSinger/${singermid}`)
  },

  getSingerHotsong(singermid: string, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getSingerHotsong/${singermid}/${limit}/${page}`)
  },

  getSingerAlbum(singermid: string, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getSingerAlbum/${singermid}/${limit}/${page}`)
  },

  getSingerMv(singermid: string, limit: number = 20, order: string = 'listen') {
    return qqRequest.get(`/getSingerMv/${singermid}/${limit}/${order}`)
  },

  getSingerDesc(singermid: string) {
    return qqRequest.get(`/getSingerDesc/${singermid}`)
  },

  getAlbumInfo(albummid: string) {
    return qqRequest.get(`/getAlbumInfo/${albummid}`)
  },

  getNewDisks(page: number = 1, limit: number = 20) {
    return qqRequest.get(`/getNewDisks/${page}/${limit}`)
  },

  getMvPlay(vid: string) {
    return qqRequest.get(`/getMvPlay/${vid}`)
  },

  getMv(areaId: number, versionId: number, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getMv/${areaId}/${versionId}/${limit}/${page}`)
  },

  getMvByTag(params: Record<string, unknown>) {
    return qqRequest.get('/getMvByTag', { params })
  },

  getRadioLists() {
    return qqRequest.get('/getRadioLists')
  },

  getDigitalAlbumLists() {
    return qqRequest.get('/getDigitalAlbumLists')
  },

  getComments(id: string, params: Record<string, unknown> = {}) {
    const { rootcommentid, cid, pagesize, pagenum, cmd, reqtype, biztype } = params as {
      rootcommentid?: string | number
      cid?: string | number
      pagesize?: string | number
      pagenum?: string | number
      cmd?: string | number
      reqtype?: string | number
      biztype?: string | number
    }

    return qqRequest.get(
      `/getComments/${id}/${rootcommentid || ''}/${cid || ''}/${pagesize || 20}/${pagenum || 1}/${cmd || 0}/${reqtype || 0}/${biztype || 0}`
    )
  },

  getImageUrl(params: Record<string, unknown>) {
    return qqRequest.get('/getImageUrl', { params })
  },

  getQQLoginQr() {
    return qqRequest.get('/user/getQQLoginQr')
  },

  checkQQLoginQr(ptqrtoken: string, qrsig: string) {
    return qqRequest.post('/user/checkQQLoginQr', null, {
      params: {
        ptqrtoken,
        qrsig
      }
    })
  },

  async checkQQMusicLogin() {
    if (!getQQCookie()) {
      return {
        data: {
          cookie: ''
        }
      }
    }

    try {
      return await qqRequest.get(QQ_LOGIN_CHECK_PATH)
    } catch (error) {
      // 处理 500 错误或网络超时，返回空 cookie 表示未登录
      if (
        (axios.isAxiosError(error) && error.response?.status === 500) ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ERR_NETWORK'
      ) {
        getLogger().warn('QQ login check failed, treating as not logged in', {
          code: error.code,
          message: error.message
        })
        return {
          data: {
            cookie: ''
          }
        }
      }

      throw error
    }
  }
}

export default qqMusicApi
