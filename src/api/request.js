import axios from 'axios'

// 检测运行环境
const isElectron = () => window.navigator.userAgent.indexOf('Electron') > -1
const isWeb = () => !isElectron()

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (isWeb() ? '/api' : 'http://localhost:3000'),
  timeout: 15000,
  // Web 环境下禁用 withCredentials 避免 CORS 问题
  withCredentials: isElectron(),
})

request.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
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
