import type { ClearStorageDataOptions } from 'electron'
import type { CacheClearOptions, CacheSize } from '@shared/protocol/cache'
import { join } from 'node:path'
import {
  AUDIO_OUTPUT_CACHE_DIR_NAME,
  clearDirectoryContents,
  formatBytes,
  getDirectorySize
} from './cachePolicy'

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

  async getCacheSize(): Promise<CacheSize> {
    const ses = session.defaultSession
    const httpCacheSize = await ses.getCacheSize()
    const nativeAudioCacheSize = await getDirectorySize(this.getNativeAudioCachePath())
    const totalCacheSize = httpCacheSize + nativeAudioCacheSize

    return {
      httpCache: httpCacheSize,
      httpCacheFormatted: formatBytes(httpCacheSize),
      nativeAudioCache: nativeAudioCacheSize,
      nativeAudioCacheFormatted: formatBytes(nativeAudioCacheSize),
      totalCache: totalCacheSize,
      totalCacheFormatted: formatBytes(totalCacheSize),
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
      nativeAudio = false,
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

    if (nativeAudio || all) {
      await this.clearNativeAudioCache(results)
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

    await this.clearNativeAudioCache(results)

    return results
  }

  getCachePaths(): Record<string, string> {
    return {
      userData: app.getPath('userData'),
      cache: app.getPath('sessionData'),
      nativeAudioCache: this.getNativeAudioCachePath(),
      temp: app.getPath('temp'),
      logs: app.getPath('logs')
    }
  }

  private getNativeAudioCachePath(): string {
    return join(app.getPath('userData'), AUDIO_OUTPUT_CACHE_DIR_NAME)
  }

  private async clearNativeAudioCache(results: CacheClearResult): Promise<void> {
    const clearResult = await clearDirectoryContents(this.getNativeAudioCachePath())
    if (clearResult.failed.length === 0) {
      results.success.push('native-audio-cache')
      return
    }

    if (clearResult.removed.length > 0) {
      results.success.push('native-audio-cache')
    }
    results.failed.push({
      type: 'native-audio-cache',
      error: clearResult.failed.map(item => `${item.path}: ${item.error}`).join('; ')
    })
  }
}

export const cacheManager = new CacheManager()
