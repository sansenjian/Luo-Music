import electron from 'electron'
import type { ClearStorageDataOptions, IpcMainInvokeEvent } from 'electron'

const { app, session, ipcMain } = electron

type CacheClearOptions = {
  cookies?: boolean
  localStorage?: boolean
  sessionStorage?: boolean
  indexDB?: boolean
  webSQL?: boolean
  cache?: boolean
  serviceWorkers?: boolean
  shaderCache?: boolean
  all?: boolean
}

type StorageType = 'cookies' | 'localstorage' | 'sessionstorage' | 'indexdb' | 'websql' | 'serviceworkers' | 'shadercache'

type CacheClearResult = {
  success: string[]
  failed: { type: string | string[]; error: string }[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class CacheManager {
  constructor() {
    // IPC handlers will be initialized when imported
  }

  init() {
    this.initIpc()
  }

  private initIpc() {
    ipcMain.handle('cache:get-size', () => this.getCacheSize())
    ipcMain.handle('cache:clear', (_: IpcMainInvokeEvent, options?: CacheClearOptions) => this.clearCache(options))
    ipcMain.handle('cache:clear-all', (_: IpcMainInvokeEvent, keepUserData?: boolean) => this.clearAllCache(keepUserData))
    ipcMain.handle('cache:get-paths', () => this.getCachePaths())
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
    const size = await ses.getCacheSize()
    return {
      httpCache: size,
      httpCacheFormatted: this.formatBytes(size)
    }
  }

  async clearCache(options: CacheClearOptions = {}) {
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
        // 类型断言：Electron 实际支持 'sessionstorage'，但其 TS 类型定义未包含
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

  async clearAllCache(keepUserData = false) {
    const ses = session.defaultSession
    const results: CacheClearResult = { success: [], failed: [] }

    const storages: StorageType[] = []
    if (keepUserData) {
      storages.push('cookies', 'sessionstorage', 'serviceworkers', 'shadercache')
    } else {
      storages.push('cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'serviceworkers', 'shadercache')
    }

    if (storages.length > 0) {
      try {
        // 类型断言：Electron 实际支持 'sessionstorage'，但其 TS 类型定义未包含
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

  getCachePaths() {
    return {
      userData: app.getPath('userData'),
      cache: app.getPath('sessionData'),
      temp: app.getPath('temp'),
      logs: app.getPath('logs')
    }
  }
}

export const cacheManager = new CacheManager()
