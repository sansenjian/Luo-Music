import pLimit from 'p-limit'
import { windowManager } from './WindowManager'
import { serviceManager } from './ServiceManager'
import type { ServiceConfig } from './types/service'
import logger from './logger'

// 在 Electron 主进程中直接使用全局 require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcMain } = require('electron')

// 限制最大并发请求数
export const LIMIT_CONCURRENCY = pLimit(3)

/**
 * 创建带并发限制的函数包装器
 * @param limit - 并发限制数
 * @returns 包装后的限流函数
 */
export function createLimitedExecutor<T extends (...args: unknown[]) => Promise<unknown>>(
  limit: number
): (fn: T, ...args: Parameters<T>) => Promise<ReturnType<T>> {
  const limiter = pLimit(limit)
  return (fn, ...args) => limiter(() => fn(...args)) as Promise<ReturnType<T>>
}

// ========== Gateway Cache Layer ==========

// 缓存配置
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000,     // 5 分钟缓存时间
  MAX_SIZE: 100,          // 最多 100 条记录
}

// 缓存存储
const gatewayCache = new Map<string, {
  data: unknown
  timestamp: number
  lastAccessed: number
}>()

/**
 * 生成缓存键
 * @param service - 服务名称
 * @param endpoint - 端点
 * @param params - 请求参数
 * @returns 缓存键
 */
function generateCacheKey(service: string, endpoint: string, params: Record<string, unknown>): string {
  return `${service}:${endpoint}:${JSON.stringify(params || {})}`
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(cacheEntry: { timestamp: number }): boolean {
  const now = Date.now()
  return (now - cacheEntry.timestamp) < CACHE_CONFIG.TTL
}

/**
 * 获取缓存（只对 GET 请求生效）
 */
function getCache(service: string, endpoint: string, params: Record<string, unknown>): unknown | null {
  // 只缓存只读端点
  const cacheableEndpoints = ['search', 'lyric', 'detail', 'playlist', 'album']
  if (!cacheableEndpoints.includes(endpoint)) {
    return null
  }

  const key = generateCacheKey(service, endpoint, params)
  const cacheEntry = gatewayCache.get(key)

  if (cacheEntry && isCacheValid(cacheEntry)) {
    // 更新访问时间 (LRU)
    cacheEntry.lastAccessed = Date.now()
    logger.info(`[Gateway Cache] HIT: ${key}`)
    return cacheEntry.data
  }

  // 缓存已过期或不存在
  if (cacheEntry) {
    gatewayCache.delete(key)
  }
  return null
}

/**
 * 设置缓存（只对 GET 请求生效）
 */
function setCache(service: string, endpoint: string, params: Record<string, unknown>, data: unknown): void {
  // 只缓存只读端点
  const cacheableEndpoints = ['search', 'lyric', 'detail', 'playlist', 'album']
  if (!cacheableEndpoints.includes(endpoint)) {
    return
  }

  const key = generateCacheKey(service, endpoint, params)

  // 如果缓存已满，删除最少使用的条目
  if (gatewayCache.size >= CACHE_CONFIG.MAX_SIZE) {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [k, v] of gatewayCache.entries()) {
      if (v.lastAccessed < oldestTime) {
        oldestTime = v.lastAccessed
        oldestKey = k
      }
    }

    if (oldestKey) {
      gatewayCache.delete(oldestKey)
    }
  }

  const now = Date.now()
  gatewayCache.set(key, {
    data,
    timestamp: now,
    lastAccessed: now
  })

  logger.info(`[Gateway Cache] SET: ${key}`)
}

/**
 * 清除所有缓存
 */
export function clearGatewayCache(): void {
  gatewayCache.clear()
  logger.info('[Gateway Cache] Cleared')
}

// 重试配置
const RETRY_CONFIG = {
  MAX_RETRIES: 3,              // 最大重试次数
  INITIAL_DELAY: 1000,         // 初始延迟 (1 秒)
  MAX_DELAY: 10000,            // 最大延迟 (10 秒)
  BACKOFF_MULTIPLIER: 2,       // 退避倍数
}

/**
 * 计算重试延迟 (指数退避)
 * @param retryCount - 当前重试次数
 * @returns 延迟时间 (毫秒)
 */
function calculateRetryDelay(retryCount: number): number {
  const exponentialDelay = RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount - 1)
  const jitter = Math.random() * 1000
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.MAX_DELAY)
}

/**
 * 检查是否应该重试
 * @param error - 错误对象
 * @param retryCount - 当前重试次数
 * @returns 是否应该重试
 */
function shouldRetry(error: unknown, retryCount: number): boolean {
  if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
    return false
  }
  
  // 检查错误对象是否有效
  if (!error) {
    return false
  }
  
  const err = error as Error & { code?: string }
  
  // 请求被取消不重试
  if (err.name === 'AbortError' || err.name === 'CanceledError') {
    return false
  }
  
  // 网络错误、超时错误、连接错误重试
  if (err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ENOTFOUND' ||
      err.message?.includes('Network Error') ||
      err.message?.includes('timeout') ||
      err.message?.includes('Service is not available')) {
    return true
  }
  
  return false
}

/**
 * 延迟执行
 * @param ms - 延迟时间 (毫秒)
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的请求执行器
 * @param fn - 要执行的函数
 * @param context - 上下文信息 (用于日志)
 * @returns 执行结果
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown
  
  for (let retryCount = 0; retryCount <= RETRY_CONFIG.MAX_RETRIES; retryCount++) {
    try {
      // 第一次请求 (retryCount = 0) 或重试
      if (retryCount > 0) {
        const delayTime = calculateRetryDelay(retryCount)
        logger.warn(`[Retry] ${context} - 第 ${retryCount} 次重试，延迟 ${Math.round(delayTime)}ms`)
        await delay(delayTime)
      }
      
      // 执行请求
      return await fn()
      
    } catch (error) {
      lastError = error
      
      // 检查是否应该重试
      if (!shouldRetry(error, retryCount)) {
        throw error
      }
      
      // 如果是最后一次重试，抛出错误
      if (retryCount >= RETRY_CONFIG.MAX_RETRIES) {
        logger.error(`[Retry] ${context} - 重试 ${RETRY_CONFIG.MAX_RETRIES} 次后仍然失败`)
        throw error
      }
      
      logger.warn(`[Retry] ${context} - 请求失败，准备重试: ${(error as Error).message}`)
    }
  }
  
  // 不应该到达这里
  throw lastError
}

// 定义播放器相关的 IPC 通道
export const PLAYER_CHANNELS = [
  'music-playing-control',
  'music-song-control',
  'music-playmode-control',
  'music-volume-up',
  'music-volume-down',
  'music-process-control',
  'music-compact-mode-control',
  'hide-player'
]

/**
 * 初始化播放器 IPC 监听
 */
export function initPlayerIPC() {
  PLAYER_CHANNELS.forEach(channel => {
    ipcMain.on(channel, (event, ...args) => {
      const mainWindow = windowManager.getWindow()
      if (mainWindow && event.sender.id !== mainWindow.webContents.id) {
        windowManager.send(channel, ...args)
      } else if (!mainWindow) {
        windowManager.send(channel, ...args)
      }
    })
  })
}

/**
 * 初始化统一 API 请求网关
 *
 * 支持的服务：
 * - qq: QQ 音乐
 * - netease: 网易云音乐
 *
 * 支持的端点：
 * - search: 搜索
 * - lyric: 歌词
 * - url: 播放链接
 */
export function initAPIGateway() {
  // 统一 API 请求网关（带缓存 + 重试机制）
  ipcMain.handle(
    'api:request',
    async (_, { service, endpoint, params, noCache }: {
      service: string
      endpoint: string
      params: Record<string, unknown>
      noCache?: boolean  // 强制跳过缓存
    }) => {
      const context = `api:request ${service}:${endpoint}`

      // 检查缓存（默认启用）
      if (!noCache) {
        const cachedData = getCache(service, endpoint, params)
        if (cachedData !== null) {
          return { success: true, data: cachedData, cached: true }
        }
      }

      try {
        // 使用重试机制执行请求
        const result = await executeWithRetry(
          () => serviceManager.handleRequest(service, endpoint, params),
          context
        )

        // 缓存结果
        if (!noCache) {
          setCache(service, endpoint, params, result)
        }

        return { success: true, data: result, cached: false }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`[API Gateway] ${context} failed after retries:`, errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 获取可用服务列表
  ipcMain.handle('api:services', () => {
    return serviceManager.getAvailableServices()
  })

  // 获取单个服务状态
  ipcMain.handle('service:status', (_, serviceId: string) => {
    return serviceManager.getServiceStatus(serviceId)
  })

  // 启动服务
  ipcMain.handle('service:start', async (_, serviceId: string) => {
    try {
      await serviceManager.startService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // 停止服务
  ipcMain.handle('service:stop', async (_, serviceId: string) => {
    try {
      await serviceManager.stopService(serviceId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // 清除 API 缓存
  ipcMain.handle('api:cache:clear', () => {
    clearGatewayCache()
    return { success: true }
  })

  // 获取缓存状态
  ipcMain.handle('api:cache:status', () => {
    return {
      size: gatewayCache.size,
      maxSize: CACHE_CONFIG.MAX_SIZE,
      ttl: CACHE_CONFIG.TTL
    }
  })
}

/**
 * 初始化服务配置
 */
export async function initServiceManager(config: ServiceConfig): Promise<void> {
  await serviceManager.initialize(config)
}
