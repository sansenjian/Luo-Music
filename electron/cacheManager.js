import { session, app } from 'electron'

/**
 * 格式化字节大小
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的字符串
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 缓存管理器
 */
export const cacheManager = {
  /**
   * 获取缓存大小
   * @returns {Promise<{httpCache: number, httpCacheFormatted: string}>}
   */
  async getCacheSize() {
    const ses = session.defaultSession
    
    // 获取 HTTP 缓存大小
    const httpCacheSize = await new Promise((resolve) => {
      ses.getCacheSize((size) => resolve(size))
    })
    
    return {
      httpCache: httpCacheSize,
      httpCacheFormatted: formatBytes(httpCacheSize)
    }
  },

  /**
   * 清理指定类型的缓存
   * @param {Object} options - 清理选项
   * @returns {Promise<{success: string[], failed: Array}>}
   */
  async clearCache(options = {}) {
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
      indexDB = false,
      webSQL = false,
      cache = false,
      serviceWorkers = false,
      shaderCache = false,
      all = false
    } = options

    const ses = session.defaultSession
    const results = { success: [], failed: [] }

    // 构建要清理的存储类型列表
    const storages = []
    if (cookies || all) storages.push('cookies')
    if (localStorage || all) storages.push('localstorage')
    if (sessionStorage || all) storages.push('sessionstorage')
    if (indexDB || all) storages.push('indexdb')
    if (webSQL || all) storages.push('websql')
    if (serviceWorkers || all) storages.push('serviceworkers')
    if (shaderCache || all) storages.push('shadercache')

    // 清理存储数据
    if (storages.length > 0) {
      try {
        await ses.clearStorageData({ storages })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: error.message })
      }
    }

    // 清理 HTTP 缓存
    if (cache || all) {
      try {
        await ses.clearCache()
        results.success.push('http-cache')
      } catch (error) {
        results.failed.push({ type: 'http-cache', error: error.message })
      }
    }

    return results
  },

  /**
   * 清理所有缓存（保留用户数据选项）
   * @param {boolean} keepUserData - 是否保留用户数据
   * @returns {Promise<{success: string[], failed: Array}>}
   */
  async clearAllCache(keepUserData = false) {
    if (keepUserData) {
      // 保留 localStorage 和 IndexedDB（可能包含用户设置）
      return await this.clearCache({
        cookies: true,
        sessionStorage: true,
        cache: true,
        serviceWorkers: true,
        shaderCache: true
      })
    }
    return await this.clearCache({ all: true })
  },

  /**
   * 获取缓存路径信息
   * @returns {Object} - 缓存路径信息
   */
  getCachePaths() {
    return {
      userData: app.getPath('userData'),
      cache: app.getPath('cache'),
      temp: app.getPath('temp'),
      logs: app.getPath('logs')
    }
  }
}
