import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { getRetryConfig } from './requestConfig'

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoff?: number
  shouldRetry?: (error: AxiosError) => boolean
  onRetry?: (error: AxiosError, retryCount: number) => void
}

type RequestConfigLike = InternalAxiosRequestConfig & {
  retry?: number | false
  retryDelay?: number
  __retryCount?: number
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function calculateRetryDelay(
  retryCount: number,
  initialDelayOrConfig: number | { retryDelay?: number } = 1000,
  maxDelay = 10000,
  backoff = 2,
  jitter = true
): number {
  const initialDelay =
    typeof initialDelayOrConfig === 'number'
      ? initialDelayOrConfig
      : (initialDelayOrConfig.retryDelay ?? 1000)
  const exponentialDelay = initialDelay * Math.pow(backoff, retryCount)
  const cappedDelay = Math.min(exponentialDelay, maxDelay)
  const jitterValue = jitter ? Math.random() * 1000 : 0

  return Math.floor(cappedDelay + jitterValue)
}

export function shouldRetry(
  error: AxiosError,
  retryConfigOrCount: ReturnType<typeof getRetryConfig> | number = getRetryConfig(),
  _requestConfig?: RequestConfigLike
): boolean {
  const retryConfig = typeof retryConfigOrCount === 'number' ? getRetryConfig() : retryConfigOrCount

  if (!retryConfig.enabled) {
    return false
  }

  if (!error.response) {
    return true
  }

  return retryConfig.statuses.includes(error.response.status)
}

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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      const axiosError = error as AxiosError
      const retryAllowed = customShouldRetry
        ? customShouldRetry(axiosError)
        : shouldRetry(axiosError)

      if (!retryAllowed || attempt >= maxRetries) {
        lastError = axiosError
        break
      }

      onRetry?.(axiosError, attempt + 1)
      await delay(
        calculateRetryDelay(attempt, initialDelay, maxDelay, backoff, getRetryConfig().jitter)
      )
    }
  }

  throw lastError
}

export function createRetryInterceptor(
  axiosInstance: Pick<AxiosInstance, 'interceptors' | 'request'>,
  options: RetryOptions = {}
): void {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, backoff = 2, onRetry } = options
  const retryConfig = getRetryConfig()

  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const config = error.config as RequestConfigLike | undefined
      if (!config || !shouldRetry(error, retryConfig, config)) {
        return Promise.reject(error)
      }

      config.__retryCount = config.__retryCount ?? 0
      if (config.__retryCount >= maxRetries) {
        return Promise.reject(error)
      }

      config.__retryCount += 1
      onRetry?.(error, config.__retryCount)

      await delay(
        calculateRetryDelay(
          config.__retryCount - 1,
          initialDelay,
          maxDelay,
          backoff,
          retryConfig.jitter
        )
      )
      return axiosInstance.request(config)
    }
  )
}

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

export function resetRetryCount(retryMap: Map<string, number>, key?: string): void {
  if (key) {
    retryMap.delete(key)
    return
  }

  retryMap.clear()
}

export default {
  calculateRetryDelay,
  executeWithRetry,
  createRetryInterceptor,
  getRetryStats,
  resetRetryCount
}
