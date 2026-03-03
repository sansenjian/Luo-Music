/**
 * 请求取消模块
 * 使用 AbortController 管理请求取消
 * 防止重复请求和内存泄漏
 */

// 存储活跃的请求
const activeRequests = new Map()

/**
 * 生成请求键
 * @param {Object} config - Axios 请求配置
 * @returns {string} 请求键
 */
export function generateRequestKey(config) {
  const { url, method, params, data } = config
  return `${method?.toUpperCase() || 'UNKNOWN'}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`
}

/**
 * 取消未完成的相同请求
 * @param {string} key - 请求键
 */
export function cancelPendingRequest(key) {
  if (activeRequests.has(key)) {
    const controller = activeRequests.get(key)
    controller.abort()
    activeRequests.delete(key)
  }
}

/**
 * 注册新的请求
 * @param {Object} config - Axios 请求配置
 * @param {AbortController} controller - AbortController 实例
 */
export function registerRequest(config, controller) {
  const key = generateRequestKey(config)
  activeRequests.set(key, controller)
}

/**
 * 移除已完成的请求
 * @param {string} key - 请求键
 */
export function removeRequest(key) {
  activeRequests.delete(key)
}

/**
 * 取消所有活跃的请求
 */
export function cancelAllRequests() {
  for (const controller of activeRequests.values()) {
    controller.abort()
  }
  activeRequests.clear()
}

/**
 * 取消指定 URL 的请求
 * @param {string} urlPattern - URL 模式 (支持正则)
 */
export function cancelRequestsByUrl(urlPattern) {
  const regex = new RegExp(urlPattern)
  for (const [key, controller] of activeRequests.entries()) {
    if (regex.test(key)) {
      controller.abort()
      activeRequests.delete(key)
    }
  }
}

/**
 * 获取活跃请求数量
 * @returns {number} 活跃请求数量
 */
export function getActiveRequestCount() {
  return activeRequests.size
}

/**
 * 获取所有活跃请求的键
 * @returns {Array<string>} 请求键数组
 */
export function getActiveRequestKeys() {
  return Array.from(activeRequests.keys())
}

/**
 * 检查请求是否活跃
 * @param {Object} config - Axios 请求配置
 * @returns {boolean} 是否活跃
 */
export function isRequestActive(config) {
  const key = generateRequestKey(config)
  return activeRequests.has(key)
}

/**
 * 创建可取消的请求包装器
 * @param {Function} requestFn - 请求函数
 * @returns {Object} 包含请求和取消方法的对象
 */
export function createCancellableRequest(requestFn) {
  const controller = new AbortController()
  
  const execute = (config) => {
    config.signal = controller.signal
    return requestFn(config)
  }
  
  const cancel = () => {
    controller.abort()
  }
  
  return { execute, cancel }
}

/**
 * 防重复请求装饰器
 * @param {Function} requestFn - 请求函数
 * @param {boolean} autoCancel - 是否自动取消之前的请求
 * @returns {Function} 装饰后的请求函数
 */
export function dedupeRequest(requestFn, autoCancel = true) {
  return async function(config) {
    const key = generateRequestKey(config)
    
    if (autoCancel && activeRequests.has(key)) {
      cancelPendingRequest(key)
    }
    
    const controller = new AbortController()
    registerRequest(config, controller)
    config.signal = controller.signal
    
    try {
      const result = await requestFn(config)
      removeRequest(key)
      return result
    } catch (error) {
      removeRequest(key)
      throw error
    }
  }
}

/**
 * 组件卸载时自动清理
 * @returns {Function} 清理函数
 */
export function cleanupOnUnmount() {
  return cancelAllRequests
}

// 监听页面卸载事件
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cancelAllRequests)
  window.addEventListener('pagehide', cancelAllRequests)
}

export default {
  cancelPendingRequest,
  registerRequest,
  removeRequest,
  cancelAllRequests,
  cancelRequestsByUrl,
  getActiveRequestCount,
  getActiveRequestKeys,
  isRequestActive,
  createCancellableRequest,
  dedupeRequest,
  cleanupOnUnmount
}
