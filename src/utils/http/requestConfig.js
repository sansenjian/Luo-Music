/**
 * 请求配置
 * 定义请求相关的全局配置选项
 */

export const RequestConfig = {
  /**
   * 缓存配置
   */
  cache: {
    enabled: true,           // 是否启用缓存
    ttl: 5 * 60 * 1000,     // 缓存时间 (5 分钟)
    max_size: 100,          // 最大缓存数量
    methods: ['get'],       // 缓存的 HTTP 方法
    cleanup_interval: 60 * 1000  // 清理间隔 (1 分钟)
  },
  
  /**
   * 重试配置
   */
  retry: {
    enabled: true,          // 是否启用重试
    max_retries: 3,         // 最大重试次数
    initial_delay: 1000,    // 初始延迟 (ms)
    max_delay: 10000,       // 最大延迟 (ms)
    backoff: 2,             // 退避倍数
    statuses: [null, 500, 502, 503, 504],  // 重试的 HTTP 状态码
    jitter: true            // 是否添加随机抖动
  },
  
  /**
   * 取消配置
   */
  cancel: {
    enabled: true,          // 是否启用取消
    auto_cancel: true,      // 自动取消相同请求
    cancel_on_unmount: true // 组件卸载时取消
  },
  
  /**
   * 超时配置
   */
  timeout: {
    default: 30000,         // 默认超时 (30 秒)
    download: 60000,        // 下载超时 (60 秒)
    upload: 60000           // 上传超时 (60 秒)
  },
  
  /**
   * 日志配置
   */
  logging: {
    enabled: true,          // 是否启用日志
    level: 'warn',          // 日志级别：'debug' | 'info' | 'warn' | 'error'
    log_request: true,      // 记录请求日志
    log_response: true,     // 记录响应日志
    log_error: true         // 记录错误日志
  }
}

/**
 * 获取缓存配置
 * @returns {Object} 缓存配置
 */
export function getCacheConfig() {
  return { ...RequestConfig.cache }
}

/**
 * 获取重试配置
 * @returns {Object} 重试配置
 */
export function getRetryConfig() {
  return { ...RequestConfig.retry }
}

/**
 * 获取取消配置
 * @returns {Object} 取消配置
 */
export function getCancelConfig() {
  return { ...RequestConfig.cancel }
}

/**
 * 更新配置
 * @param {string} category - 配置类别：'cache' | 'retry' | 'cancel' | 'timeout' | 'logging'
 * @param {Object} newConfig - 新的配置
 */
export function updateConfig(category, newConfig) {
  if (RequestConfig[category]) {
    Object.assign(RequestConfig[category], newConfig)
  }
}

/**
 * 重置配置为默认值
 * @param {string} category - 配置类别，如果为空则重置所有配置
 */
export function resetConfig(category) {
  const defaultConfig = getDefaultConfig()
  
  if (category) {
    if (defaultConfig[category]) {
      RequestConfig[category] = { ...defaultConfig[category] }
    }
  } else {
    Object.assign(RequestConfig, defaultConfig)
  }
}

/**
 * 获取默认配置
 * @returns {Object} 默认配置
 */
function getDefaultConfig() {
  return {
    cache: {
      enabled: true,
      ttl: 5 * 60 * 1000,
      max_size: 100,
      methods: ['get'],
      cleanup_interval: 60 * 1000
    },
    retry: {
      enabled: true,
      max_retries: 3,
      initial_delay: 1000,
      max_delay: 10000,
      backoff: 2,
      statuses: [null, 500, 502, 503, 504],
      jitter: true
    },
    cancel: {
      enabled: true,
      auto_cancel: true,
      cancel_on_unmount: true
    },
    timeout: {
      default: 30000,
      download: 60000,
      upload: 60000
    },
    logging: {
      enabled: true,
      level: 'warn',
      log_request: true,
      log_response: true,
      log_error: true
    }
  }
}

/**
 * 导出所有配置
 * @returns {Object} 所有配置
 */
export function exportConfig() {
  return JSON.parse(JSON.stringify(RequestConfig))
}

/**
 * 导入配置
 * @param {Object} config - 要导入的配置
 */
export function importConfig(config) {
  if (typeof config === 'object' && config !== null) {
    for (const key in config) {
      if (RequestConfig[key] && typeof config[key] === 'object') {
        Object.assign(RequestConfig[key], config[key])
      } else {
        RequestConfig[key] = config[key]
      }
    }
  }
}

export default RequestConfig
