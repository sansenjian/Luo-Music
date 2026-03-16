/**
 * Web Platform Service Implementation
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

export class WebPlatformService extends PlatformServiceBase {
  readonly name = 'web'

  private readonly eventListeners = new Map<string, Set<IMessageHandler>>()

  override isElectron(): boolean {
    return false
  }

  override minimizeWindow(): void {
    console.debug('[WebPlatformService] minimizeWindow not available in web mode')
  }

  override maximizeWindow(): void {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        console.debug('[WebPlatformService] Failed to enter fullscreen')
      })
    }
  }

  override closeWindow(): void {
    console.debug('[WebPlatformService] closeWindow not available in web mode')
  }

  override on(channel: string, callback: IMessageHandler): IDisposable {
    const handler = ((event: Event): void => {
      callback((event as CustomEvent).detail)
    }) as EventListener

    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set())
    }
    this.eventListeners.get(channel)?.add(callback)

    window.addEventListener(`ipc:${channel}`, handler)

    return Disposable.from(() => {
      window.removeEventListener(`ipc:${channel}`, handler)
      this.eventListeners.get(channel)?.delete(callback)
    })
  }

  override send(channel: string, data: unknown): void {
    window.dispatchEvent(new CustomEvent(`ipc:${channel}`, { detail: data }))
  }

  override async getCacheSize(): Promise<ICacheSize> {
    if (navigator.storage?.estimate) {
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

    let totalSize = 0

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          totalSize += (localStorage.getItem(key) || '').length * 2
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
    const result: IClearCacheResult = { success: [], failed: [] }
    const clearAll = Boolean(options.all)

    if (options.cache || clearAll) {
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map(name => caches.delete(name)))
        }
        result.success.push('http-cache')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear cache API:', error)
        result.failed.push({ type: 'http-cache', error: this.getErrorMessage(error) })
      }
    }

    if (options.cookies || clearAll) {
      try {
        this.clearDocumentCookies()
        result.success.push('cookies')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear cookies:', error)
        result.failed.push({ type: 'cookies', error: this.getErrorMessage(error) })
      }
    }

    if (options.localStorage || clearAll) {
      try {
        localStorage.clear()
        result.success.push('localstorage')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear localStorage:', error)
        result.failed.push({ type: 'localstorage', error: this.getErrorMessage(error) })
      }
    }

    if (options.sessionStorage || clearAll) {
      try {
        sessionStorage.clear()
        result.success.push('sessionstorage')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear sessionStorage:', error)
        result.failed.push({ type: 'sessionstorage', error: this.getErrorMessage(error) })
      }
    }

    if (options.indexDB || clearAll) {
      try {
        await this.clearIndexedDBDatabases()
        result.success.push('indexdb')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear IndexedDB:', error)
        result.failed.push({ type: 'indexdb', error: this.getErrorMessage(error) })
      }
    }

    if (options.serviceWorkers || clearAll) {
      try {
        await this.clearServiceWorkers()
        result.success.push('serviceworkers')
      } catch (error) {
        console.warn('[WebPlatformService] Failed to clear service workers:', error)
        result.failed.push({ type: 'serviceworkers', error: this.getErrorMessage(error) })
      }
    }

    if (options.webSQL || clearAll) {
      console.debug('[WebPlatformService] webSQL clear is not supported in web mode')
    }

    if (options.shaderCache || clearAll) {
      console.debug('[WebPlatformService] shader cache clear is not supported in web mode')
    }

    return result
  }

  override async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    if (keepUserData) {
      return this.clearCache({
        cookies: true,
        sessionStorage: true,
        cache: true,
        serviceWorkers: true
      })
    }

    return this.clearCache({ all: true })
  }

  private clearDocumentCookies(): void {
    if (!document.cookie) {
      return
    }

    const cookies = document.cookie.split(';')
    for (const item of cookies) {
      const key = item.split('=')[0]?.trim()
      if (!key) {
        continue
      }
      document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
    }
  }

  private async clearIndexedDBDatabases(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return
    }

    const indexedDBWithDatabases = indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>
    }

    if (typeof indexedDBWithDatabases.databases !== 'function') {
      return
    }

    const dbList = await indexedDBWithDatabases.databases()
    await Promise.all(
      dbList
        .map(db => db.name)
        .filter((name): name is string => Boolean(name))
        .map(
          name =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.deleteDatabase(name)
              request.onsuccess = () => resolve()
              request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`))
              request.onblocked = () => reject(new Error(`IndexedDB delete blocked: ${name}`))
            })
        )
    )
  }

  private async clearServiceWorkers(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  dispose(): void {
    this.eventListeners.clear()
  }
}
