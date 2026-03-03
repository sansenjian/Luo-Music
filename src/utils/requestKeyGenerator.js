/**
 * 请求键生成器
 * 用于生成唯一的请求标识符
 */

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
 * 生成缓存键 (简化版)
 * @param {Object} config - Axios 请求配置
 * @returns {string} 缓存键
 */
export function generateCacheKey(config) {
  const { url, method, params } = config
  return `${method?.toUpperCase() || 'GET'}:${url}:${JSON.stringify(params || {})}`
}

/**
 * 解析请求键
 * @param {string} key - 请求键
 * @returns {Object} 解析后的信息
 */
export function parseRequestKey(key) {
  const parts = key.split(':')
  if (parts.length < 2) {
    return { method: 'UNKNOWN', url: key, params: {}, data: {} }
  }
  
  const [method, url, paramsStr, dataStr] = parts
  
  try {
    return {
      method,
      url,
      params: paramsStr ? JSON.parse(paramsStr) : {},
      data: dataStr ? JSON.parse(dataStr) : {}
    }
  } catch {
    return { method, url, params: {}, data: {} }
  }
}

/**
 * 比较两个请求键是否相同
 * @param {Object} config1 - 第一个请求配置
 * @param {Object} config2 - 第二个请求配置
 * @returns {boolean} 是否相同
 */
export function isSameRequest(config1, config2) {
  return generateRequestKey(config1) === generateRequestKey(config2)
}

/**
 * 批量生成请求键
 * @param {Array<Object>} configs - 请求配置数组
 * @returns {Array<string>} 请求键数组
 */
export function generateRequestKeys(configs) {
  return configs.map(config => generateRequestKey(config))
}

export default {
  generateRequestKey,
  generateCacheKey,
  parseRequestKey,
  isSameRequest,
  generateRequestKeys
}
