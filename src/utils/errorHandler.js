import { ElMessage } from 'element-plus'

/**
 * 错误类型枚举
 */
export const ErrorType = {
  NETWORK: 'network',
  API: 'api',
  PLAYER: 'player',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown'
}

/**
 * 错误消息映射
 */
const ErrorMessages = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
  [ErrorType.API]: '服务请求失败，请稍后重试',
  [ErrorType.PLAYER]: '播放出错，请尝试其他歌曲',
  [ErrorType.VALIDATION]: '输入数据无效',
  [ErrorType.UNKNOWN]: '发生未知错误'
}

/**
 * 统一错误处理函数
 * @param {Error} error - 错误对象
 * @param {Object} options - 配置选项
 * @param {string} options.type - 错误类型
 * @param {string} options.customMessage - 自定义错误消息
 * @param {boolean} options.showToast - 是否显示提示
 * @param {Function} options.onError - 错误回调
 * @returns {Object} - 错误处理结果
 */
export function handleError(error, options = {}) {
  const {
    type = ErrorType.UNKNOWN,
    customMessage = '',
    showToast = true,
    onError = null
  } = options

  // 记录错误日志
  console.error(`[${type.toUpperCase()} Error]:`, error)

  // 确定显示的消息
  const message = customMessage || error.message || ErrorMessages[type]

  // 显示用户提示
  if (showToast) {
    ElMessage({
      message,
      type: 'error',
      duration: 3000
    })
  }

  // 执行回调
  if (onError && typeof onError === 'function') {
    onError(error)
  }

  return {
    type,
    message,
    originalError: error
  }
}

/**
 * API 错误处理
 * @param {Error} error - 错误对象
 * @param {string} customMessage - 自定义消息
 */
export function handleApiError(error, customMessage = '') {
  return handleError(error, {
    type: ErrorType.API,
    customMessage: customMessage || '请求失败，请稍后重试'
  })
}

/**
 * 播放器错误处理
 * @param {Error} error - 错误对象
 * @param {string} customMessage - 自定义消息
 */
export function handlePlayerError(error, customMessage = '') {
  return handleError(error, {
    type: ErrorType.PLAYER,
    customMessage: customMessage || '播放出错，请尝试其他歌曲'
  })
}

/**
 * 网络错误处理
 * @param {Error} error - 错误对象
 */
export function handleNetworkError(error) {
  return handleError(error, {
    type: ErrorType.NETWORK
  })
}

/**
 * 异步操作包装器
 * @param {Function} fn - 异步函数
 * @param {Object} options - 错误处理选项
 * @returns {Function} - 包装后的函数
 */
export function withErrorHandling(fn, options = {}) {
  return async function (...args) {
    try {
      return await fn.apply(this, args)
    } catch (error) {
      handleError(error, options)
      return null
    }
  }
}
