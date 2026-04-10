import { QQMusicAdapter } from './adapter'
import { services } from '@/services'
import type { ConfigService } from '@/services/configService'
import type { ILogger } from '@/services/loggerService'
import type { PlatformService } from '@/services/platformService'
import { ErrorCode } from '@/utils/error/types'
import { useUserStore } from '../store/userStore'
import { createCachedCookieResolver, createTransport } from '../utils/http/transportFactory'
import { isElectronRenderer } from '../utils/http/transportShared'
import { HTTP_COOKIE_CACHE_TTL } from '@/constants/http'

const DEFAULT_QQ_MUSIC_BASE_URL = '/qq-api'

let cachedQQBaseURL: string | null = null
let resolvingQQBaseURL: Promise<string> | null = null

const QQ_COOKIE_CACHE_TTL = HTTP_COOKIE_CACHE_TTL
const QQ_LOGIN_CHECK_PATH = '/user/getCookie'

type QQMusicApiDeps = {
  getLoggerFactory: () => { createLogger(resource: string): ILogger }
  getPlatformService: () => Pick<PlatformService, 'getServiceStatus'>
  getConfigService: () => Pick<ConfigService, 'getPort'>
}

const defaultQQMusicApiDeps: QQMusicApiDeps = {
  getLoggerFactory: () => services.logger(),
  getPlatformService: () => services.platform(),
  getConfigService: () => services.config()
}

let qqMusicApiDeps: QQMusicApiDeps = defaultQQMusicApiDeps
let _logger: ILogger | undefined

export function configureQQMusicApiDeps(deps: Partial<QQMusicApiDeps>): void {
  qqMusicApiDeps = {
    ...qqMusicApiDeps,
    ...deps
  }
  _logger = undefined
  cachedQQBaseURL = null
  resolvingQQBaseURL = null
}

export function resetQQMusicApiDeps(): void {
  qqMusicApiDeps = defaultQQMusicApiDeps
  _logger = undefined
  cachedQQBaseURL = null
  resolvingQQBaseURL = null
}

function getLogger() {
  if (_logger === undefined) {
    _logger = qqMusicApiDeps.getLoggerFactory().createLogger('qqMusicApi')
  }
  return _logger
}

export function getQQMusicApiServerURL(port: number): string {
  return `http://127.0.0.1:${port}`
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
        const platformService = qqMusicApiDeps.getPlatformService()
        const status = await platformService.getServiceStatus?.('qq')
        const port = typeof status?.port === 'number' ? status.port : null
        if (port) {
          cachedQQBaseURL = `http://127.0.0.1:${port}`
          return cachedQQBaseURL
        }
      } catch {
        // ignore and fall back
      }

      cachedQQBaseURL = getQQMusicApiServerURL(qqMusicApiDeps.getConfigService().getPort('qq'))
      return cachedQQBaseURL
    })()
  }

  return resolvingQQBaseURL
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

const qqCookieResolver = createCachedCookieResolver(() => {
  const userStore = useUserStore()
  return userStore.qqCookie || null
}, QQ_COOKIE_CACHE_TTL)

function getQQCookie(): string | null {
  return qqCookieResolver.getCookie()
}

type QQLoginErrorLike = {
  code?: unknown
  cause?: {
    code?: unknown
    status?: unknown
    response?: {
      status?: unknown
    }
  }
  data?: {
    code?: unknown
    status?: unknown
    responseData?: {
      code?: unknown
      status?: unknown
    }
  }
}

const RECOVERABLE_QQ_LOGIN_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ERR_NETWORK',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN'
])

const RECOVERABLE_QQ_LOGIN_APP_ERROR_CODES = new Set([
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.API_TIMEOUT,
  ErrorCode.NETWORK_OFFLINE
])

export function isRecoverableQQLoginError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const record = error as QQLoginErrorLike
  const appErrorCode = typeof record.code === 'number' ? record.code : null
  if (appErrorCode !== null && RECOVERABLE_QQ_LOGIN_APP_ERROR_CODES.has(appErrorCode)) {
    return true
  }

  const codes: string[] = [
    record.code,
    record.data?.code,
    record.data?.responseData?.code,
    record.cause?.code
  ].filter((value): value is string => typeof value === 'string')

  if (codes.some(code => RECOVERABLE_QQ_LOGIN_ERROR_CODES.has(code))) {
    return true
  }

  const statuses: number[] = [
    record.data?.status,
    record.data?.responseData?.status,
    record.cause?.status,
    record.cause?.response?.status
  ].filter((value): value is number => typeof value === 'number')

  return statuses.some(
    status => status === 500 || status === 502 || status === 503 || status === 504
  )
}

function isLikelyQQNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const record = error as {
    code?: unknown
    message?: unknown
    response?: unknown
  }

  const code = typeof record.code === 'string' ? record.code : ''
  const message = typeof record.message === 'string' ? record.message : ''

  if (['ERR_NETWORK', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true
  }

  if (record.response) {
    return false
  }

  return /network error|failed to fetch|service .* not available|socket hang up/i.test(message)
}

const qqRequest = createTransport({
  service: 'qq',
  baseURL: resolveQQMusicBaseURL,
  timeout: 30000,
  cookie: {
    resolver: qqCookieResolver,
    injectIntoParams: true,
    injectIntoHeaders: true,
    headerName: 'X-Custom-Cookie'
  },
  unwrapData: true,
  extend(client) {
    client.interceptors.response.use(undefined, error => {
      const requestUrl =
        typeof error?.config?.url === 'string' ? error.config.url : String(error?.config?.url ?? '')

      const isQQLoginCheck = requestUrl.includes(QQ_LOGIN_CHECK_PATH)

      if (
        isQQLoginCheck &&
        (error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ERR_NETWORK' ||
          error.code === 'ECONNABORTED' ||
          !error.response)
      ) {
        getLogger().debug('QQ login check network error, ignoring', {
          url: requestUrl,
          code: error.code,
          message: error.message
        })
        return Promise.reject(error)
      }

      if (!isQQLoginCheck) {
        getLogger().error('QQ Music API request failed', {
          url: requestUrl,
          status: error?.response?.status,
          code: error?.code,
          message: error?.message,
          responseData: error?.response?.data
        })
      }

      if (isLikelyQQNetworkError(error)) {
        getLogger().warn('QQ Music API network request failed', {
          url: requestUrl,
          code: error?.code,
          message: error?.message
        })
        console.warn('[QQMusic] 网络错误，请检查 QQ 音乐 API 服务是否正常运行')
      }

      return Promise.reject(error)
    })
  }
})

export const qqMusicAdapter = new QQMusicAdapter(qqRequest)

export function clearQQCookieCache(): void {
  qqCookieResolver.clear()
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
      const response = await qqRequest.get(QQ_LOGIN_CHECK_PATH)
      if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        response.data &&
        typeof response.data === 'object' &&
        'cookie' in response.data
      ) {
        return response
      }

      return {
        data: {
          cookie: (response as { cookie?: string }).cookie || ''
        }
      }
    } catch (error) {
      if (isRecoverableQQLoginError(error)) {
        getLogger().warn('QQ login check failed, treating as not logged in', {
          error
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
