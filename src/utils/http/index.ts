import axios from 'axios'

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
import {
  createCachedCookieResolver,
  createStaticResponse,
  createTransport,
  type TransportRequestConfig
} from './transportFactory'
import { normalizeApiError } from '../error/normalize'
import { isElectronRenderer } from './transportShared'
export { createLatestRequestController } from './requestScope'
import {
  HTTP_COOKIE_CACHE_TTL,
  HTTP_DEFAULT_RETRY_COUNT,
  HTTP_DEFAULT_RETRY_DELAY,
  HTTP_DEFAULT_TIMEOUT,
  DEV_API_SERVER
} from '@/constants/http'
import type { ILogger } from '../../services/loggerService'

type ErrorService = typeof services.error extends () => infer R ? R : never

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

let cachedErrorService: ErrorService | null = null
let _logger: ILogger | undefined

function getLogger() {
  if (_logger === undefined) {
    _logger = services.logger().createLogger('httpRequest')
  }
  return _logger
}

function getErrorService(): ErrorService {
  if (!cachedErrorService) {
    cachedErrorService = services.error()
  }
  return cachedErrorService
}

const getBaseURL = () => {
  if (isElectronRenderer() && import.meta.env.PROD) {
    return DEV_API_SERVER
  }
  return '/api'
}

const cookieResolver = createCachedCookieResolver(() => {
  const userStore = useUserStore() as UserStoreLike
  return userStore?.cookie || null
}, HTTP_COOKIE_CACHE_TTL)

const getCachedCookie = () => cookieResolver.getCookie()

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
  cookieResolver.clear()
}

export { AUTH_REQUEST_CACHE_NAMESPACE, clearCacheNamespaces, cleanupExpiredCache, getCacheStats }
export const clearRequestCache = clearRequestCacheInternal
export { cancelAllRequests, cancelRequestsByUrl, getActiveRequestCount }

const request = createTransport({
  service: 'netease',
  baseURL: getBaseURL,
  timeout: HTTP_DEFAULT_TIMEOUT,
  withCredentials: isElectronRenderer,
  retry: HTTP_DEFAULT_RETRY_COUNT,
  retryDelay: HTTP_DEFAULT_RETRY_DELAY,
  cookie: {
    resolver: cookieResolver,
    injectIntoParams: true
  },
  unwrapData: false,
  extend(client) {
    client.interceptors.request.use(
      async config => {
        const requestConfig = config as TransportRequestConfig
        const cookie = getCachedCookie()

        if (!requestConfig.cacheNamespace) {
          requestConfig.cacheNamespace = cookie ? AUTH_REQUEST_CACHE_NAMESPACE : 'public'
        }

        if (requestConfig.method === 'get' && requestConfig.cache !== false) {
          const cached = getCache(requestConfig)
          if (cached) {
            getLogger().debug('Request cache hit', { url: requestConfig.url })
            requestConfig.adapter = async () => createStaticResponse(requestConfig, cached)
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

    client.interceptors.response.use(
      response => {
        const config = response.config as TransportRequestConfig

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

        const config = error.config as TransportRequestConfig

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
          return client(config)
        }

        const status = error.response?.status
        if (status === 301 || status === 401 || status === 502) {
          getLogger().warn('Detected invalid login session or upstream auth failure', {
            status,
            url: config.url
          })
          logoutIfNeeded()
        }

        const errorService = getErrorService()
        const appError = normalizeApiError(error, undefined, { url: config.url })
        errorService.emit(appError)
        return Promise.reject(appError)
      }
    )
  }
})

export default request
