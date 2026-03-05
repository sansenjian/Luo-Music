import axios from 'axios'
import { useUserStore } from '../store/userStore'
import { getCache, setCache, clearCache, cleanupExpiredCache } from '../utils/requestCache'
import { cancelPendingRequest, registerRequest, removeRequest, generateRequestKey } from '../utils/requestCanceler'
import { shouldRetry, calculateRetryDelay, executeWithRetry } from '../utils/requestRetry'
import { errorCenter, Errors, AppError, ErrorCode } from '../utils/error'

const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1
const isWeb = () => !isElectron()

const getBaseURL = () => {
  if (isElectron()) {
    return 'http://localhost:14532'
  }
  return '/api'
}

// 创建 axios 实例
const request = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  withCredentials: isElectron(),
  retry: 3,
  retryDelay: 1000,
})

// Cache for user cookie to avoid repeated store access
let cachedCookie = null
let lastCookieCheck = 0
const COOKIE_CACHE_TTL = 5000 // 5 seconds

const getCachedCookie = () => {
  const now = Date.now()
  // Return cached cookie if still valid
  if (cachedCookie !== null && (now - lastCookieCheck) < COOKIE_CACHE_TTL) {
    return cachedCookie
  }
  
  // Get from Pinia store only (single source of truth)
  try {
    const userStore = useUserStore()
    cachedCookie = userStore?.cookie || null
    lastCookieCheck = now
    return cachedCookie
  } catch {
    // Pinia store not available
    cachedCookie = null
    lastCookieCheck = now
    return null
  }
}

// Expose method to clear cache when user logs out
export const clearCookieCache = () => {
  cachedCookie = null
  lastCookieCheck = 0
}

// 导出缓存和请求管理方法
export { clearCache, cleanupExpiredCache, getCacheStats } from '../utils/requestCache'
export { cancelAllRequests, cancelRequestsByUrl, getActiveRequestCount } from '../utils/requestCanceler'

request.interceptors.request.use(
  async (config) => {
    // 1. 检查缓存 (仅 GET 请求)
    if (config.method === 'get' && config.cache !== false) {
      const cached = getCache(config)
      if (cached) {
        config.cacheHit = true
        config.cachedData = cached
        console.debug('[Request Cache] Hit:', config.url)
      }
    }
    
    // 2. 取消未完成的相同请求
    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      cancelPendingRequest(key)
    }
    
    // 3. 创建 AbortController
    const controller = new AbortController()
    config.signal = controller.signal
    
    // 4. 注册请求
    if (config.cancel !== false) {
      registerRequest(config, controller)
    }
    
    // 5. 添加 Cookie
    const cookie = getCachedCookie()
    if (cookie) {
      config.params = {
        ...config.params,
        cookie
      }
    }
    
    return config
  },
  (error) => {
    console.error('[Request Error]', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    const config = response.config
    
    // 1. 移除已完成的请求
    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      removeRequest(key)
    }
    
    // 2. 如果是缓存命中，直接返回
    if (config.cacheHit) {
      return config.cachedData
    }
    
    // 3. 缓存 GET 请求响应
    if (config.method === 'get' && config.cache !== false && !config.skipCache) {
      setCache(config, response.data)
    }
    
    // 4. 原有逻辑 (登录失效处理、HTTP 转 HTTPS)
    if (response.data && response.data.code === 301) {
      // 登录状态失效，自动清除用户信息
      console.warn('登录状态已失效，请重新登录')
      try {
        const userStore = useUserStore()
        if (userStore && userStore.isLoggedIn) {
          userStore.logout()
        }
      } catch {
        // Pinia store 不可用
      }
    }
    
    if (response.data && config.url?.includes('/song/url')) {
      const data = response.data.data || response.data
      if (Array.isArray(data)) {
        data.forEach(song => {
          if (song.url && song.url.startsWith('http://')) {
            song.url = song.url.replace('http://', 'https://')
          }
        })
      }
    }
    
    return response.data
  },
  async (error) => {
    const config = error.config
    if (!config) return Promise.reject(error)
    
    // 1. 移除失败的请求
    if (config.cancel !== false) {
      const key = generateRequestKey(config)
      removeRequest(key)
    }
    
    // 2. 检查是否应该重试
    config.retryCount = config.retryCount || 0
    const maxRetries = config.retry ?? 3
    
    if (config.retry !== false && config.retryCount < maxRetries && shouldRetry(error, config.retryCount, config)) {
      config.retryCount++
      
      // 3. 计算延迟时间 (指数退避)
      const delay = calculateRetryDelay(config.retryCount, config)
      console.warn(
        `[Request Retry] ${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url} ` +
        `failed (attempt ${config.retryCount}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`
      )
      
      // 4. 延迟后重试
      await new Promise(resolve => setTimeout(resolve, delay))
      return request(config)
    }
    
    // 5. 原有逻辑 (登录失效处理)
    const status = error.response?.status
    if (status === 301 || status === 401 || status === 502) {
      console.warn('检测到登录失效或网络错误，尝试清除用户信息')
      try {
        const userStore = useUserStore()
        if (userStore && userStore.isLoggedIn) {
          userStore.logout()
        }
      } catch {
        // Pinia store 不可用
      }
    }
    
    // 集成 ErrorCenter
    let appError
    if (!window.navigator.onLine) {
      appError = Errors.network()
    } else if (status === 404) {
      appError = new AppError(ErrorCode.PLAYLIST_NOT_FOUND, 'Resource not found')
    } else if (error.code === 'ECONNABORTED') {
      appError = new AppError(ErrorCode.API_TIMEOUT, 'Request timeout')
    } else if (status === 429) {
      appError = new AppError(ErrorCode.API_RATE_LIMIT, 'Too many requests')
    } else {
      // 不自动上报未知错误，避免刷屏，仅记录
      // errorCenter.emit 会处理
    }

    if (appError) {
      errorCenter.emit(appError)
      // 如果已处理，可能不需要再 reject，或者 reject appError 供上层判断
      return Promise.reject(appError)
    }

    console.error('[Response Error]', error.message || 'Network Error')
    return Promise.reject(error)
  }
)

export default request
