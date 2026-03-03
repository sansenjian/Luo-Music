/**
 * 请求重试模块
 * 实现指数退避策略 (Exponential Backoff)
 * 自动重试失败的网络请求
 */

// 重试配置
const RETRY_CONFIG = {
  MAX_RETRIES: 3,              // 最大重试次数
  INITIAL_DELAY: 1000,         // 初始延迟 (1 秒)
  MAX_DELAY: 10000,            // 最大延迟 (10 秒)
  BACKOFF_MULTIPLIER: 2,       // 退避倍数
  SHOULD_RETRY_STATUSES: [null, 500, 502, 503, 504]  // 重试的 HTTP 状态码
}

/**
 * 检查是否应该重试
 * @param {Error} error - 请求错误
 * @param {number} retryCount - 当前重试次数
 * @param {Object} config - Axios 请求配置
 * @returns {boolean} 是否应该重试
 */
export function shouldRetry(error, retryCount, config) {
  // 检查是否启用了重试
  if (config?.retry === false) {
    return false
  }
  
  // 检查重试次数
  const maxRetries = config?.retry ?? RETRY_CONFIG.MAX_RETRIES
  if (retryCount >= maxRetries) {
    return false
  }
  
  // 检查错误对象是否有效
  if (!error) {
    return false
  }
  
  // 检查请求是否被取消
  if (error.name === 'AbortError' || error.name === 'CanceledError') {
    return false
  }
  
  // 检查 HTTP 状态码
  const status = error.response?.status
  if (status !== undefined && status !== null && !RETRY_CONFIG.SHOULD_RETRY_STATUSES.includes(status)) {
    // 4xx 客户端错误不重试
    if (status >= 400 && status < 500) {
      return false
    }
  }
  
  // 网络错误重试 (没有 response 或有 response 但状态码需要重试)
  if (!error.response) {
    return true
  }
  
  // 超时错误重试
  if (error.code === 'ECONNABORTED') {
    return true
  }
  
  // 服务器错误重试
  if (status !== undefined && status !== null && status >= 500) {
    return true
  }
  
  // undefined 状态码 (网络相关问题) 重试
  if (status === undefined) {
    return true
  }
  
  return false
}

/**
 * 计算重试延迟 (指数退避)
 * @param {number} retryCount - 当前重试次数
 * @param {Object} config - Axios 请求配置
 * @returns {number} 延迟时间 (毫秒)
 */
export function calculateRetryDelay(retryCount, config) {
  const initialDelay = config.retryDelay ?? RETRY_CONFIG.INITIAL_DELAY
  const maxDelay = config.retryMaxDelay ?? RETRY_CONFIG.MAX_DELAY
  const backoff = config.retryBackoff ?? RETRY_CONFIG.BACKOFF_MULTIPLIER
  
  // 指数退避计算
  const exponentialDelay = initialDelay * Math.pow(backoff, retryCount - 1)
  
  // 添加随机抖动 (0-1000ms)，避免多个请求同时重试
  const jitter = Math.random() * 1000
  
  // 限制最大延迟
  return Math.min(exponentialDelay + jitter, maxDelay)
}

/**
 * 执行重试
 * @param {Object} request - Axios 请求实例
 * @param {Object} config - Axios 请求配置
 * @param {number} retryCount - 当前重试次数
 * @returns {Promise} 重试结果
 */
export async function retryRequest(request, config, retryCount) {
  // 添加重试计数
  config.retryCount = retryCount
  
  // 记录重试日志
  console.log(`[Request Retry] Attempt ${retryCount} for ${config.url}`)
  
  // 执行重试
  return request(config)
}

/**
 * 重试回调
 * @param {Error} error - 错误对象
 * @param {Object} config - Axios 请求配置
 * @param {number} retryCount - 当前重试次数
 */
export function onRetry(error, config, retryCount) {
  const url = config.url
  const method = config.method?.toUpperCase() || 'UNKNOWN'
  
  console.warn(
    `[Request Retry] ${method} ${url} failed (attempt ${retryCount}). ` +
    `Error: ${error.message || 'Network Error'}`
  )
  
  // 可以添加自定义的重试回调
  if (config.onRetry) {
    config.onRetry(error, config, retryCount)
  }
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间 (毫秒)
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的请求执行器
 * @param {Object} request - Axios 请求实例
 * @param {Object} config - Axios 请求配置
 * @returns {Promise} 请求结果
 */
export async function executeWithRetry(request, config) {
  let lastError
  const maxRetries = config.retry ?? RETRY_CONFIG.MAX_RETRIES
  
  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    try {
      // 第一次请求 (retryCount = 0) 或重试
      if (retryCount > 0) {
        // 计算延迟
        const delayTime = calculateRetryDelay(retryCount, config)
        await delay(delayTime)
        
        // 执行重试回调
        onRetry(lastError, config, retryCount)
      }
      
      // 执行请求
      return await request(config)
      
    } catch (error) {
      lastError = error
      
      // 检查是否应该重试
      if (!shouldRetry(error, retryCount, config)) {
        throw error
      }
      
      // 如果是最后一次重试，抛出错误
      if (retryCount >= maxRetries) {
        console.error(
          `[Request Failed] ${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url} ` +
          `failed after ${maxRetries} retries. Error: ${error.message}`
        )
        throw error
      }
    }
  }
  
  // 不应该到达这里
  throw lastError
}

/**
 * 获取重试配置
 * @returns {Object} 重试配置
 */
export function getRetryConfig() {
  return { ...RETRY_CONFIG }
}

/**
 * 更新重试配置
 * @param {Object} newConfig - 新的配置
 */
export function updateRetryConfig(newConfig) {
  Object.assign(RETRY_CONFIG, newConfig)
}

/**
 * 重试统计信息
 */
const retryStats = {
  totalRetries: 0,
  successfulRetries: 0,
  failedRetries: 0
}

/**
 * 记录重试统计
 * @param {boolean} success - 是否成功
 */
export function recordRetryStat(success) {
  retryStats.totalRetries++
  if (success) {
    retryStats.successfulRetries++
  } else {
    retryStats.failedRetries++
  }
}

/**
 * 获取重试统计
 * @returns {Object} 重试统计
 */
export function getRetryStats() {
  return { ...retryStats }
}

/**
 * 重置重试统计
 */
export function resetRetryStats() {
  retryStats.totalRetries = 0
  retryStats.successfulRetries = 0
  retryStats.failedRetries = 0
}

export default {
  shouldRetry,
  calculateRetryDelay,
  retryRequest,
  onRetry,
  executeWithRetry,
  getRetryConfig,
  updateRetryConfig,
  getRetryStats,
  resetRetryStats
}
