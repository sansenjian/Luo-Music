import axios from 'axios'

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

request.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('user')
    if (stored) {
      try {
        const userState = JSON.parse(stored)
        if (userState?.cookie) {
          config.params = {
            ...config.params,
            cookie: userState.cookie
          }
        }
      } catch (e) {
        // ignore parse errors
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
