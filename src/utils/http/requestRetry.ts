/**
 * 请求重试模块
 * 实现指数退避重试策略
 */

import type { AxiosError, InternalAxiosRequestConfig, AxiosResponse, AxiosInterceptorSuccessFn, AxiosInterceptorErrorFn } from 'axios'
import { getRetryConfig } from './requestConfig'

/**
 * 重试配置接口
 */
interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoff?: number
  shouldRetry?: (error: AxiosError) => boolean
  onRetry?: (error: AxiosError, retryCount: number) => void
}

/**
 * 延迟函数
 * @param ms - 延迟毫秒数
 * @returns Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 计算重试延迟时间 (指数退避)
 * @param retryCount - 当前重试次数
 * @param initialDelay - 初始延迟 (ms)
 * @param maxDelay - 最大延迟 (ms)
 * @param backoff - 退避倍数
 * @param jitter - 是否添加随机抖动
 * @returns 延迟时间 (ms)
 */
export function calculateRetryDelay(
  retryCount: number,
  initialDelay: number = 1000,
  maxDelay: number = 10000,
  backoff: number = 2,
  jitter: boolean = true
): number {
  // 指数退避公式：delay = initialDelay * (backoff ^ retryCount)
  const exponentialDelay = initialDelay * Math.pow(backoff, retryCount)
  const cappedDelay = Math.min(exponentialDelay, maxDelay)
  
  // 添加随机抖动 (0-1000ms)
  if (jitter) {
    const jitterValue = Math.random() * 1000
    return Math.floor(cappedDelay + jitterValue)
  }
  
  return Math.floor(cappedDelay)
}

/**
 * 判断是否应该重试
 * @param error - Axios 错误对象
 * @param retryConfig - 重试配置
 * @returns 是否应该重试
 */
/**
 * 判断是否应该重试
 * @param error - Axios 错误对象
 * @param retryConfig - 重试配置
 * @returns 是否应该重试
 */
export function shouldRetry(error: AxiosError, retryConfig: ReturnType<typeof getRetryConfig>): boolean {
  if (!retryConfig.enabled) {
    return false
  }
  
  // 网络错误重试（无响应）
  if (!error.response) {
    return true
  }
  
  // 检查状态码是否在重试列表中
  const status = error.response.status
  return retryConfig.statuses.includes(status)
}

/**
 * 带重试的请求执行函数
 * @param requestFn - 请求函数
 * @param options - 重试选项
 * @returns 请求结果
 */
export async function executeWithRetry<T>(
  requestFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoff = 2,
    shouldRetry: customShouldRetry,
    onRetry
  } = options
  
  let lastError: AxiosError | null = null
  const retryConfig = getRetryConfig()
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      const axiosError = error as AxiosError
      
      // 判断是否应该重试
      const shouldRetryNow = customShouldRetry 
        ? customShouldRetry(axiosError)
        : shouldRetry(axiosError, retryConfig)
      
      // 不重试或已达到最大重试次数
      if (!shouldRetryNow || attempt >= maxRetries) {
        lastError = axiosError
        break
      }
      
      // 执行重试回调
      if (onRetry) {
        onRetry(axiosError, attempt + 1)
      }
      
      // 计算延迟时间
      const retryDelay = calculateRetryDelay(
        attempt,
        initialDelay,
        maxDelay,
        backoff,
        retryConfig.jitter
      )
      
      // 等待后重试
      await delay(retryDelay)
    }
  }
  
  // 抛出最后的错误
  throw lastError
}

/**
 * 创建带重试的 Axios 拦截器
 * @param axiosInstance - Axios 实例
 * @param options - 重试选项
 */
export function createRetryInterceptor<T = unknown>(
  axiosInstance: { interceptors: { response: { use: (onFulfilled?: AxiosInterceptorSuccessFn<AxiosResponse<T>>, onRejected?: AxiosInterceptorErrorFn) => void } } },
  options: RetryOptions = {}
): void {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoff = 2,
    onRetry
  } = options
  
  const retryMap = new Map<string, number>()
  const retryConfig = getRetryConfig()
  
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig & { 
        __retryCount?: number
        __retryKey?: string
      }
      
      if (!config) {
        return Promise.reject(error)
      }
      
      // 生成请求键
      const retryKey = `${config.method}:${config.url}`
      config.__retryKey = retryKey
      
      // 初始化重试计数
      if (config.__retryCount === undefined) {
        config.__retryCount = 0
      }
      
      // 判断是否应该重试
      if (!shouldRetry(error, retryConfig)) {
        return Promise.reject(error)
      }
      
      // 检查是否超过最大重试次数
      if (config.__retryCount >= maxRetries) {
        return Promise.reject(error)
      }
      
      // 增加重试计数
      config.__retryCount++
      
      // 执行重试回调
      if (onRetry) {
        onRetry(error, config.__retryCount)
      }
      
      // 计算延迟时间
      const retryDelay = calculateRetryDelay(
        config.__retryCount - 1,
        initialDelay,
        maxDelay,
        backoff,
        retryConfig.jitter
      )
      
      // 等待后重试
      await delay(retryDelay)
      
      // 重新发起请求
      return axiosInstance.request(config)
    }
  )
}

/**
 * 获取重试统计信息
 * @param retryMap - 重试计数 Map
 * @returns 统计信息
 */
export function getRetryStats(retryMap: Map<string, number>): { 
  totalRetries: number
  maxRetries: number
  averageRetries: number
} {
  const values = Array.from(retryMap.values())
  const totalRetries = values.reduce((sum, count) => sum + count, 0)
  const maxRetries = values.length > 0 ? Math.max(...values) : 0
  const averageRetries = values.length > 0 ? totalRetries / values.length : 0
  
  return {
    totalRetries,
    maxRetries,
    averageRetries
  }
}

/**
 * 重置重试计数
 * @param retryMap - 重试计数 Map
 * @param key - 请求键，如果为空则重置所有
 */
export function resetRetryCount(retryMap: Map<string, number>, key?: string): void {
  if (key) {
    retryMap.delete(key)
  } else {
    retryMap.clear()
  }
}

export default {
  calculateRetryDelay,
  executeWithRetry,
  createRetryInterceptor,
  getRetryStats,
  resetRetryCount
}
