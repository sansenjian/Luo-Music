import axios from 'axios'
import { useUserStore } from '../store/userStore'

const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1
const isWeb = () => !isElectron()

const getBaseURL = () => {
  if (isElectron()) {
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

request.interceptors.request.use(
  (config) => {
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
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    if (response.data && response.config.url?.includes('/song/url')) {
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
  (error) => {
    const message = error.response?.status
      ? `HTTP Error: ${error.response.status}`
      : error.message || 'Network Error'
    console.error('Response error:', message)
    return Promise.reject(error)
  }
)

export default request
