import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useUserStore } from '../../store/userStore'
import { getCache, setCache, clearCache, cleanupExpiredCache, getCacheStats } from './requestCache'
import { cancelPendingRequest, registerRequest, removeRequest, generateRequestKey, cancelAllRequests, cancelRequestsByUrl, getActiveRequestCount } from './requestCanceler'
import { shouldRetry, calculateRetryDelay } from './requestRetry'
import { errorCenter, Errors, AppError, ErrorCode } from '../error'

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
  skipCache?: boolean
  cancel?: boolean
  retry?: number | false
  retryDelay?: number
  retryCount?: number
  params?: RequestParams
}

const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1

const getBaseURL = () => {
  // 开发环境下（使用 Vite 开发服务器），使用代理
  // 生产环境下（Electron 打包后），直接访问本地服务
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
  retryDelay: 1000,
} as AxiosRequestConfig)

let cachedCookie: string | null = null
let lastCookieCheck = 0
const COOKIE_CACHE_TTL = 5000

const getCachedCookie = () => {
  const now = Date.now()
  if (cachedCookie !== null && (now - lastCookieCheck) < COOKIE_CACHE_TTL) {
    return cachedCookie
  }
  
  try {
    const userStore = useUserStore() as UserStoreLike
    cachedCookie = userStore?.cookie || null
    lastCookieCheck = now
    return cachedCookie
  } catch {
    cachedCookie = null
    lastCookieCheck = now
    return null
  }
}

const logoutIfNeeded = () => {
  try {
    const userStore = useUserStore() as UserStoreLike
    if (userStore?.isLoggedIn && typeof userStore.logout === 'function') {
      userStore.logout()
    }
  } catch {
    // Pinia store 不可用
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

export { clearCache, cleanupExpiredCache, getCacheStats }
export { cancelAllRequests, cancelRequestsByUrl, getActiveRequestCount }

request.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const requestConfig = config as RequestConfig

    if (requestConfig.method === 'get' && requestConfig.cache !== false) {
      const cached = getCache(requestConfig)
      if (cached) {
        console.debug('[Request Cache] Hit:', requestConfig.url)
        requestConfig.adapter = async () => ({
          data: cached,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: requestConfig,
          request: undefined,
        } as AxiosResponse)
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
    
    const cookie = getCachedCookie()
    if (cookie) {
      requestConfig.params = {
        ...(requestConfig.params || {}),
        cookie
      }
    }
    
    return requestConfig
  },
  (error: unknown) => {
    console.error('[Request Error]', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response: AxiosResponse) => {
    const config = response.config as RequestConfig
    
    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      removeRequest(key)
    }
    
    if (config.method === 'get' && config.cache !== false && !config.skipCache) {
      setCache(config, response.data)
    }
    
    const responseData = response.data as SongUrlResponse | Record<string, unknown> | undefined
    if (responseData && responseData.code === 301) {
      console.warn('登录状态已失效，请重新登录')
      logoutIfNeeded()
    }
    
    if (responseData && config.url?.includes('/song/url')) {
      const songs = normalizeSongUrlResponse(responseData)
      songs.forEach((song: SongUrlItem) => {
        if (song.url && song.url.startsWith('http://')) {
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
    
    config.retryCount = config.retryCount || 0
    const maxRetries = typeof config.retry === 'number' ? config.retry : 3
    
    if (config.retry !== false && config.retryCount < maxRetries && shouldRetry(error, config.retryCount, config)) {
      config.retryCount++
      
      const delay = calculateRetryDelay(config.retryCount, config)
      console.warn(
        `[Request Retry] ${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url} ` +
        `failed (attempt ${config.retryCount}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`
      )
      
      await new Promise(resolve => setTimeout(resolve, delay))
      return request(config)
    }
    
    const status = error.response?.status
    if (status === 301 || status === 401 || status === 502) {
      console.warn('检测到登录失效或网络错误，尝试清除用户信息')
      logoutIfNeeded()
    }
    
    let appError: AppError | undefined
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
      errorCenter.emit(appError)
      return Promise.reject(appError)
    }

    console.error('[Response Error]', error.message || 'Network Error')
    return Promise.reject(error)
  }
)

export default request
