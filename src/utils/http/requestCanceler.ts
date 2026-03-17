/**
 * 请求取消模块
 * 使用 AbortController 管理请求取消
 * 防止重复请求和内存泄漏
 */

import type { AxiosRequestConfig } from 'axios'

// 存储活跃的请求
const activeRequests = new Map<string, AbortController>()

/**
 * 生成请求键
 * @param config - Axios 请求配置
 * @returns 请求键
 */
export function generateRequestKey(config: AxiosRequestConfig): string {
  const { url, method, params, data } = config
  return `${method?.toUpperCase() || 'UNKNOWN'}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`
}

/**
 * 取消未完成的相同请求
 * @param key - 请求键
 */
export function cancelPendingRequest(key: string): void {
  if (activeRequests.has(key)) {
    const controller = activeRequests.get(key)
    controller?.abort()
    activeRequests.delete(key)
  }
}

/**
 * 注册新的请求
 * @param config - Axios 请求配置
 * @param controller - AbortController 实例
 */
export function registerRequest(config: AxiosRequestConfig, controller: AbortController): void {
  const key = generateRequestKey(config)
  activeRequests.set(key, controller)
}

/**
 * 移除已完成的请求
 * @param key - 请求键
 */
export function removeRequest(key: string): void {
  activeRequests.delete(key)
}

/**
 * 取消所有活跃的请求
 */
export function cancelAllRequests(): void {
  for (const controller of activeRequests.values()) {
    controller.abort()
  }
  activeRequests.clear()
}

/**
 * 取消指定 URL 的请求
 * @param urlPattern - URL 模式 (支持正则)
 */
export function cancelRequestsByUrl(urlPattern: string): void {
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
 * @returns 活跃请求数量
 */
export function getActiveRequestCount(): number {
  return activeRequests.size
}

/**
 * 获取所有活跃请求的键
 * @returns 请求键数组
 */
export function getActiveRequestKeys(): string[] {
  return Array.from(activeRequests.keys())
}

/**
 * 检查请求是否活跃
 * @param config - Axios 请求配置
 * @returns 是否活跃
 */
export function isRequestActive(config: AxiosRequestConfig): boolean {
  const key = generateRequestKey(config)
  return activeRequests.has(key)
}

/**
 * 创建可取消的请求包装器
 * @param requestFn - 请求函数
 * @returns 包含请求和取消方法的对象
 */
export function createCancellableRequest<T = any>(
  requestFn: (config: AxiosRequestConfig) => Promise<T>
) {
  const controller = new AbortController()

  const execute = (config: AxiosRequestConfig): Promise<T> => {
    config.signal = controller.signal
    return requestFn(config)
  }

  const cancel = (): void => {
    controller.abort()
  }

  return { execute, cancel }
}

/**
 * 防重复请求装饰器
 * @param requestFn - 请求函数
 * @param autoCancel - 是否自动取消之前的请求
 * @returns 装饰后的请求函数
 */
export function dedupeRequest<T = any>(
  requestFn: (config: AxiosRequestConfig) => Promise<T>,
  autoCancel = true
) {
  return async function (config: AxiosRequestConfig): Promise<T> {
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
 * @returns 清理函数
 */
export function cleanupOnUnmount(): () => void {
  return cancelAllRequests
}

// 监听页面卸载事件（使用单次初始化标志防止 HMR 重复注册）
if (typeof window !== 'undefined') {
  const CANCELER_INIT_SYMBOL = Symbol.for('http-request-canceler-initialized')

  if (!(window as unknown as Record<symbol, boolean>)[CANCELER_INIT_SYMBOL]) {
    window.addEventListener('beforeunload', cancelAllRequests)
    window.addEventListener('pagehide', cancelAllRequests)
    ;(window as unknown as Record<symbol, boolean>)[CANCELER_INIT_SYMBOL] = true
  }
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
