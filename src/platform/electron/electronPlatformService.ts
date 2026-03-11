/**
 * Electron Platform Service Implementation
 * Electron 平台服务实现
 */

import type { IDisposable } from '../../base/common/lifecycle/disposable'
import { Disposable, DisposableStore } from '../../base/common/lifecycle/disposable'
import { PlatformServiceBase, formatBytes } from '../common/platformService'
import type {
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from '../common/types'

/**
 * Electron API 类型定义
 * 与 preload.js 中暴露的 API 对应
 */
interface IElectronAPI {
  // Window Management
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void

  // IPC
  on(channel: string, callback: (data: unknown) => void): () => void
  send(channel: string, data: unknown): void

  // Player State
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: string): void

  // Cache Management
  getCacheSize(): Promise<ICacheSize>
  clearCache(options: IClearCacheOptions): Promise<IClearCacheResult>
  clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult>
}

/**
 * Electron 平台服务
 * 实现 Electron 特定的平台功能
 */
export class ElectronPlatformService extends PlatformServiceBase {
  readonly name = 'electron'
  
  private readonly api: IElectronAPI | undefined
  private readonly disposables = new DisposableStore()

  constructor() {
    super()
    
    // 获取 Electron API
    this.api = (window as unknown as { electronAPI?: IElectronAPI }).electronAPI
    
    if (!this.api) {
      console.error('[ElectronPlatformService] Electron API not found! Is preload.js loaded?')
    }
  }

  // ==================== IPlatformInfoService ====================

  override isElectron(): boolean {
    return true
  }

  // ==================== IWindowService ====================

  override minimizeWindow(): void {
    this.api?.minimizeWindow()
  }

  override maximizeWindow(): void {
    this.api?.maximizeWindow()
  }

  override closeWindow(): void {
    this.api?.closeWindow()
  }

  // ==================== IIPCService ====================

  override on(channel: string, callback: IMessageHandler): IDisposable {
    if (this.api?.on) {
      const unsubscribe = this.api.on(channel, callback)
      
      const disposable = new Disposable(() => {
        unsubscribe()
      })
      
      this.disposables.add(disposable)
      return disposable
    }
    
    return Disposable.NONE
  }

  override send(channel: string, data: unknown): void {
    this.api?.send(channel, data)
  }

  override sendPlayingState(playing: boolean): void {
    this.api?.sendPlayingState(playing)
  }

  override sendPlayModeChange(mode: string): void {
    this.api?.sendPlayModeChange(mode)
  }

  // ==================== ICacheService ====================

  override async getCacheSize(): Promise<ICacheSize> {
    if (this.api?.getCacheSize) {
      return this.api.getCacheSize()
    }
    return super.getCacheSize()
  }

  override async clearCache(options: IClearCacheOptions): Promise<IClearCacheResult> {
    if (this.api?.clearCache) {
      return this.api.clearCache(options)
    }
    return super.clearCache(options)
  }

  override async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    if (this.api?.clearAllCache) {
      return this.api.clearAllCache(keepUserData)
    }
    return super.clearAllCache(keepUserData)
  }

  // ==================== Lifecycle ====================

  /**
   * 销毁服务，清理所有监听器
   */
  dispose(): void {
    this.disposables.dispose()
  }
}