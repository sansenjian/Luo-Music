import type { ClearStorageDataOptions } from 'electron'
import type { CacheClearOptions } from './shared/protocol/cache.ts'

const { app, session, ipcMain } = require('electron')

type StorageType =
  | 'cookies'
  | 'localstorage'
  | 'sessionstorage'
  | 'indexdb'
  | 'websql'
  | 'serviceworkers'
  | 'shadercache'

type CacheClearResult = {
  success: string[]
  failed: { type: string | string[]; error: string }[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class CacheManager {
  private ipcInitialized = false

  init(): void {
    if (this.ipcInitialized) {
      return
    }

    this.initIpc()
    this.ipcInitialized = true
  }

  private initIpc(): void {
    const safeHandle = (channel: string, listener: (...args: unknown[]) => unknown) => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, listener)
    }

    safeHandle('cache:get-size', () => this.getCacheSize())
    safeHandle('cache:clear', async (...args: unknown[]) => {
      const options = args[1] as CacheClearOptions | undefined
      return this.clearCache(options)
    })
    safeHandle('cache:clear-all', async (...args: unknown[]) => {
      const keepUserData = args[1] as boolean | undefined
      return this.clearAllCache(keepUserData)
    })
    safeHandle('cache:get-paths', () => this.getCachePaths())
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async getCacheSize() {
    const ses = session.defaultSession
    const httpCacheSize = await ses.getCacheSize()

    return {
      httpCache: httpCacheSize,
      httpCacheFormatted: this.formatBytes(httpCacheSize),
      note: 'Storage data size is not available via Electron API'
    }
  }

  async clearCache(options: CacheClearOptions = {}): Promise<CacheClearResult> {
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
      indexDB = false,
      webSQL = false,
      cache = false,
      serviceWorkers = false,
      shaderCache = false,
      all = false
    } = options

    const ses = session.defaultSession
    const results: CacheClearResult = { success: [], failed: [] }

    const storages: StorageType[] = []
    if (cookies || all) storages.push('cookies')
    if (localStorage || all) storages.push('localstorage')
    if (sessionStorage || all) storages.push('sessionstorage')
    if (indexDB || all) storages.push('indexdb')
    if (webSQL || all) storages.push('websql')
    if (serviceWorkers || all) storages.push('serviceworkers')
    if (shaderCache || all) storages.push('shadercache')

    if (storages.length > 0) {
      try {
        await ses.clearStorageData({ storages: storages as ClearStorageDataOptions['storages'] })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: getErrorMessage(error) })
      }
    }

    if (cache || all) {
      try {
        await ses.clearCache()
        results.success.push('http-cache')
      } catch (error) {
        results.failed.push({ type: 'http-cache', error: getErrorMessage(error) })
      }
    }

    return results
  }

  async clearAllCache(keepUserData = false): Promise<CacheClearResult> {
    const ses = session.defaultSession
    const results: CacheClearResult = { success: [], failed: [] }

    const storages: StorageType[] = []
    if (keepUserData) {
      storages.push('cookies', 'sessionstorage', 'serviceworkers', 'shadercache')
    } else {
      storages.push(
        'cookies',
        'localstorage',
        'sessionstorage',
        'indexdb',
        'websql',
        'serviceworkers',
        'shadercache'
      )
    }

    if (storages.length > 0) {
      try {
        await ses.clearStorageData({ storages: storages as ClearStorageDataOptions['storages'] })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: getErrorMessage(error) })
      }
    }

    try {
      await ses.clearCache()
      results.success.push('http-cache')
    } catch (error) {
      results.failed.push({ type: 'http-cache', error: getErrorMessage(error) })
    }

    return results
  }

  getCachePaths(): Record<string, string> {
    return {
      userData: app.getPath('userData'),
      cache: app.getPath('sessionData'),
      temp: app.getPath('temp'),
      logs: app.getPath('logs')
    }
  }
}

export const cacheManager = new CacheManager()
