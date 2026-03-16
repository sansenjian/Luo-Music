/**
 * 缓存管理 IPC 处理器
 */

import { INVOKE_CHANNELS } from '../../shared/protocol/channels.ts'
import { ipcService } from '../IpcService'
import { cacheManager } from '../../cacheManager.ts'
import type { CacheClearOptions, CacheClearResult } from '../types'

// 将内部 CacheClearResult 转换为 IPC CacheClearResult
function convertCacheClearResult(result: {
  success: string[]
  failed: { type: string | string[]; error: string }[]
}): CacheClearResult {
  return {
    success: result.success,
    failed: result.failed.map(item => ({
      type: Array.isArray(item.type) ? item.type.join(', ') : item.type,
      error: item.error
    }))
  }
}

export function registerCacheHandlers(): void {
  // ========== Invoke Handlers ==========

  ipcService.registerInvoke(INVOKE_CHANNELS.CACHE_GET_SIZE, async () => {
    return cacheManager.getCacheSize()
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.CACHE_CLEAR,
    async (options: CacheClearOptions = {}) => {
      const result = await cacheManager.clearCache(options)
      return convertCacheClearResult(result)
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.CACHE_CLEAR_ALL, async (keepUserData?: boolean) => {
    const result = await cacheManager.clearAllCache(keepUserData)
    return convertCacheClearResult(result)
  })

  ipcService.registerInvoke(INVOKE_CHANNELS.CACHE_GET_PATHS, async () => {
    return Promise.resolve(cacheManager.getCachePaths())
  })
}
