import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { services } from '../../services'
import { useUserStore } from '../../store/userStore'
import {
  AUTH_REQUEST_CACHE_NAMESPACE,
  clearCache as clearRequestCacheInternal,
  clearCacheNamespaces,
  cleanupExpiredCache,
  getCache,
  getCacheStats,
  setCache
} from './requestCache'
import {
  cancelAllRequests,
  cancelPendingRequest,
  cancelRequestsByUrl,
  generateRequestKey,
  getActiveRequestCount,
  registerRequest,
  removeRequest
} from './requestCanceler'
import { calculateRetryDelay, shouldRetry } from './requestRetry'
import { isCanceledRequestError } from './cancelError'

type ErrorService = import('../../services').ErrorService

type RequestParams = Record<string, unknown>

type UserStoreLike = {
  cookie?: string | null
  isLoggedIn?: boolean
  logout?: () => void
}

type SongUrlItem = {
  url?: string | null
}

type SongUrlResponse = {
  code?: number
  data?: SongUrlItem[]
}

type RequestConfig = InternalAxiosRequestConfig & {
  cache?: boolean
  cacheNamespace?: string
  skipCache?: boolean
  cancel?: boolean
  retry?: number | false
  retryDelay?: number
  retryCount?: number
  params?: RequestParams
}

let cachedErrorService: ErrorService | null = null
let cachedCookie: string | null = null
let lastCookieCheck = 0
let _logger: import('../../services/loggerService').ILogger | undefined

const COOKIE_CACHE_TTL = 5000

function getLogger() {
  if (_logger === undefined) {
    _logger = services.logger().createLogger('httpRequest')
  }
  return _logger
}

function getErrorService(): Promise<ErrorService> {
  if (!cachedErrorService) {
    cachedErrorService = services.error()
  }
  return Promise.resolve(cachedErrorService)
}

const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1

const getBaseURL = () => {
  if (isElectron() && import.meta.env.PROD) {
    return 'http://localhost:14532'
  }
  return '/api'
}

const request = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  withCredentials: isElectron(),
  retry: 3,
  retryDelay: 1000
} as AxiosRequestConfig)

const getCachedCookie = () => {
  const now = Date.now()
  if (cachedCookie !== null && now - lastCookieCheck < COOKIE_CACHE_TTL) {
    return cachedCookie
  }

  try {
    const userStore = useUserStore() as UserStoreLike
    cachedCookie = userStore?.cookie || null
  } catch {
    cachedCookie = null
  }

  lastCookieCheck = now
  return cachedCookie
}

const logoutIfNeeded = () => {
  try {
    const userStore = useUserStore() as UserStoreLike
    if (userStore?.isLoggedIn && typeof userStore.logout === 'function') {
      userStore.logout()
    }
  } catch {
    // Ignore store access failures here.
  }
}

const normalizeSongUrlResponse = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return [] as SongUrlItem[]
  }

  const maybeSongUrlResponse = payload as SongUrlResponse
  const data = maybeSongUrlResponse.data ?? payload
  return Array.isArray(data) ? data : []
}

export const clearCookieCache = () => {
  cachedCookie = null
  lastCookieCheck = 0
}

export { AUTH_REQUEST_CACHE_NAMESPACE, clearCacheNamespaces, cleanupExpiredCache, getCacheStats }
export const clearRequestCache = clearRequestCacheInternal
export { cancelAllRequests, cancelRequestsByUrl, getActiveRequestCount }

request.interceptors.request.use(
  async config => {
    const requestConfig = config as RequestConfig
    const cookie = getCachedCookie()

    if (cookie) {
      requestConfig.params = {
        ...(requestConfig.params || {}),
        cookie
      }
    }

    if (!requestConfig.cacheNamespace) {
      requestConfig.cacheNamespace = cookie ? AUTH_REQUEST_CACHE_NAMESPACE : 'public'
    }

    if (requestConfig.method === 'get' && requestConfig.cache !== false) {
      const cached = getCache(requestConfig)
      if (cached) {
        getLogger().debug('Request cache hit', { url: requestConfig.url })
        requestConfig.adapter = async () =>
          ({
            data: cached,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: requestConfig,
            request: undefined
          }) as AxiosResponse
        return requestConfig
      }
    }

    if (requestConfig.cancel !== false) {
      const key = generateRequestKey(requestConfig)
      cancelPendingRequest(key)
    }

    const controller = new AbortController()
    requestConfig.signal = controller.signal

    if (requestConfig.cancel !== false) {
      registerRequest(requestConfig, controller)
    }

    return requestConfig
  },
  (error: unknown) => {
    getLogger().error('Request interceptor failed', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  response => {
    const config = response.config as RequestConfig

    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      removeRequest(key)
    }

    if (config.method === 'get' && config.cache !== false && !config.skipCache) {
      setCache(config, response.data)
    }

    const responseData = response.data as SongUrlResponse | Record<string, unknown> | undefined
    if (responseData?.code === 301) {
      getLogger().warn('Login status expired, clearing local user session')
      logoutIfNeeded()
    }

    if (responseData && config.url?.includes('/song/url')) {
      const songs = normalizeSongUrlResponse(responseData)
      songs.forEach((song: SongUrlItem) => {
        if (song.url?.startsWith('http://')) {
          song.url = song.url.replace('http://', 'https://')
        }
      })
    }

    return response.data
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error)
    }

    const config = error.config as RequestConfig

    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      removeRequest(key)
    }

    if (isCanceledRequestError(error)) {
      getLogger().debug('Request canceled', {
        method: config.method?.toUpperCase() || 'UNKNOWN',
        url: config.url
      })
      return Promise.reject(error)
    }

    config.retryCount = config.retryCount || 0
    const maxRetries = typeof config.retry === 'number' ? config.retry : 3

    if (
      config.retry !== false &&
      config.retryCount < maxRetries &&
      shouldRetry(error, config.retryCount, config)
    ) {
      config.retryCount++

      const delay = calculateRetryDelay(config.retryCount, config)
      getLogger().warn('Retrying failed request', {
        method: config.method?.toUpperCase() || 'UNKNOWN',
        url: config.url,
        attempt: config.retryCount,
        maxRetries,
        delay
      })

      await new Promise(resolve => setTimeout(resolve, delay))
      return request(config)
    }

    const status = error.response?.status
    if (status === 301 || status === 401 || status === 502) {
      getLogger().warn('Detected invalid login session or upstream auth failure', {
        status,
        url: config.url
      })
      logoutIfNeeded()
    }

    let appError: InstanceType<ErrorService['AppError']> | undefined
    const errorService = await getErrorService()
    const { Errors, AppError, ErrorCode } = errorService

    if (!window.navigator.onLine) {
      appError = Errors.network()
    } else if (status === 404) {
      appError = new AppError(ErrorCode.PLAYLIST_NOT_FOUND, 'Resource not found')
    } else if (error.code === 'ECONNABORTED') {
      appError = new AppError(ErrorCode.API_TIMEOUT, 'Request timeout')
    } else if (status === 429) {
      appError = new AppError(ErrorCode.API_RATE_LIMIT, 'Too many requests')
    }

    if (appError) {
      errorService.emit(appError)
      return Promise.reject(appError)
    }

    getLogger().error('Unhandled response error', {
      status,
      url: config.url,
      code: error.code,
      message: error.message || 'Network Error'
    })
    return Promise.reject(error)
  }
)

export default request
