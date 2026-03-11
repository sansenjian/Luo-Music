/**
 * Web Platform Service Implementation
 * Web 平台服务实现
 */

import type { IDisposable } from '../../base/common/lifecycle/disposable'
import { Disposable } from '../../base/common/lifecycle/disposable'
import { PlatformServiceBase, formatBytes } from '../common/platformService'
import type {
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from '../common/types'

/**
 * Web 平台服务
 * 实现 Web 浏览器特定的平台功能
 */
export class WebPlatformService extends PlatformServiceBase {
  readonly name = 'web'
  
  private readonly eventListeners = new Map<string, Set<IMessageHandler>>()

  constructor() {
    super()
  }

  // ==================== IPlatformInfoService ====================

  override isElectron(): boolean {
    return false
  }

  // ==================== IWindowService ====================

  override minimizeWindow(): void {
    // Web 环境下无法最小化窗口
    console.debug('[WebPlatformService] minimizeWindow not available in web mode')
  }

  override maximizeWindow(): void {
    // Web 环境下可以尝试全屏
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        console.debug('[WebPlatformService] Failed to enter fullscreen')
      })
    }
  }

  override closeWindow(): void {
    // Web 环境下无法关闭窗口
    console.debug('[WebPlatformService] closeWindow not available in web mode')
  }

  // ==================== IIPCService ====================

  override on(channel: string, callback: IMessageHandler): IDisposable {
    // Web 环境下使用自定义事件模拟 IPC
    // 使用 Map 存储 handler 引用，确保 dispose 时能正确移除
    const handlerMap = new Map<IMessageHandler, EventListener>()
    
    const handler = ((event: Event): void => {
      const customEvent = event as CustomEvent
      callback(customEvent.detail)
    }) as EventListener
    
    handlerMap.set(callback, handler)

    // 存储监听器引用以便管理
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set())
    }
    this.eventListeners.get(channel)!.add(callback)

    // 添加 DOM 事件监听
    window.addEventListener(`ipc:${channel}`, handler)

    return new Disposable(() => {
      // 移除 DOM 事件监听
      window.removeEventListener(`ipc:${channel}`, handler)
      // 从管理集合中移除
      this.eventListeners.get(channel)?.delete(callback)
      handlerMap.delete(callback)
    })
  }

  override send(channel: string, data: unknown): void {
    // Web 环境下使用自定义事件模拟 IPC
    const event = new CustomEvent(`ipc:${channel}`, { detail: data })
    window.dispatchEvent(event)
  }

  // ==================== ICacheService ====================

  override async getCacheSize(): Promise<ICacheSize> {
    // 使用 Storage API 估算存储使用量
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          httpCache: estimate.usage || 0,
          httpCacheFormatted: formatBytes(estimate.usage || 0),
          quota: estimate.quota || 0,
          quotaFormatted: formatBytes(estimate.quota || 0)
        }
      } catch (error) {
        console.warn('[WebPlatformService] Failed to estimate storage:', error)
      }
    }

    // 降级方案：估算 localStorage 和 sessionStorage
    let totalSize = 0
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          totalSize += (localStorage.getItem(key) || '').length * 2 // UTF-16
        }
      }
      
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key) {
          totalSize += (sessionStorage.getItem(key) || '').length * 2
        }
      }
    } catch (error) {
      console.warn('[WebPlatformService] Failed to calculate storage size:', error)
    }

    return {
      httpCache: totalSize,
      httpCacheFormatted: formatBytes(totalSize)
    }
  }

  override async clearCache(options: IClearCacheOptions): Promise<IClearCacheResult> {
    const failed: string[] = []

    if (options.httpCache) {
      try {
        // 清除 Cache API
        if ('caches' in window) {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map(name => caches.delete(name)))
        }
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear cache API:', error)
        failed.push('cache-api')
      }
    }

    if (options.userData && !options.keepUserData) {
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear storage:', error)
        failed.push('storage')
      }
    }

    return { failed }
  }

  override async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    return this.clearCache({
      httpCache: true,
      userData: !keepUserData,
      keepUserData
    })
  }

  // ==================== Lifecycle ====================

  /**
   * 销毁服务，清理所有监听器
   */
  dispose(): void {
    this.eventListeners.clear()
  }
}