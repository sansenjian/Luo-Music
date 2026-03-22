/**
 * Electron Platform Service Implementation
 */

import type { IDisposable } from '@/base/common/lifecycle/disposable'
import { Disposable, DisposableStore } from '@/base/common/lifecycle/disposable'
import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../../electron/shared/protocol/channels'
import { PlatformServiceBase } from '../common/platformService'
import type {
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from '../common/types'

interface IElectronAPI {
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  on(channel: string, callback: (data: unknown) => void): () => void
  send(channel: string, data: unknown): void
  supportsSendChannel?(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  getCacheSize(): Promise<ICacheSize>
  clearCache(options?: IClearCacheOptions): Promise<IClearCacheResult>
  clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult>
}

interface IServiceBridge {
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (...args: unknown[]) => void): () => void
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  supportsSendChannel?(channel: string): boolean
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
}

export class ElectronPlatformService extends PlatformServiceBase {
  readonly name = 'electron'

  private readonly api: IElectronAPI | undefined
  private readonly servicesBridge: IServiceBridge | undefined
  private readonly disposables = new DisposableStore()

  constructor() {
    super()

    const globalWindow = window as unknown as {
      electronAPI?: IElectronAPI
      services?: IServiceBridge
    }

    this.api = globalWindow.electronAPI
    this.servicesBridge = globalWindow.services

    if (!this.api && !this.servicesBridge) {
      console.error('[ElectronPlatformService] Electron API not found! Is preload script loaded?')
    }
  }

  override isElectron(): boolean {
    return true
  }

  override minimizeWindow(): void {
    if (this.api?.minimizeWindow) {
      this.api.minimizeWindow()
      return
    }

    this.servicesBridge?.window.minimize()
  }

  override maximizeWindow(): void {
    if (this.api?.maximizeWindow) {
      this.api.maximizeWindow()
      return
    }

    this.servicesBridge?.window.toggleMaximize()
  }

  override closeWindow(): void {
    if (this.api?.closeWindow) {
      this.api.closeWindow()
      return
    }

    this.servicesBridge?.window.close()
  }

  override on(channel: string, callback: IMessageHandler): IDisposable {
    if (this.api?.on) {
      const unsubscribe = this.api.on(channel, callback)
      const disposable = Disposable.from(() => {
        unsubscribe()
      })

      this.disposables.add(disposable)
      return disposable
    }

    if (this.servicesBridge?.on) {
      const unsubscribe = this.servicesBridge.on(channel, data => {
        callback(data)
      })
      const disposable = Disposable.from(() => {
        unsubscribe()
      })

      this.disposables.add(disposable)
      return disposable
    }

    return Disposable.none
  }

  override send(channel: string, data: unknown): void {
    if (this.api?.send) {
      this.api.send(channel, data)
      return
    }

    this.servicesBridge?.send(channel, data)
  }

  override supportsSendChannel(channel: string): boolean {
    if (this.api?.supportsSendChannel) {
      return this.api.supportsSendChannel(channel)
    }

    if (this.servicesBridge?.supportsSendChannel) {
      return this.servicesBridge.supportsSendChannel(channel)
    }

    return true
  }

  override sendPlayingState(playing: boolean): void {
    if (this.api?.sendPlayingState) {
      this.api.sendPlayingState(playing)
      return
    }

    this.servicesBridge?.send(SEND_CHANNELS.MUSIC_PLAYING_CHECK, playing)
  }

  override sendPlayModeChange(mode: number): void {
    if (this.api?.sendPlayModeChange) {
      this.api.sendPlayModeChange(mode)
      return
    }

    this.servicesBridge?.send(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, mode)
  }

  override async getCacheSize(): Promise<ICacheSize> {
    if (this.api?.getCacheSize) {
      return this.api.getCacheSize()
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<ICacheSize>(INVOKE_CHANNELS.CACHE_GET_SIZE)
    }

    return super.getCacheSize()
  }

  override async clearCache(options: IClearCacheOptions = {}): Promise<IClearCacheResult> {
    if (this.api?.clearCache) {
      return this.api.clearCache(options)
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<IClearCacheResult>(INVOKE_CHANNELS.CACHE_CLEAR, options)
    }

    return super.clearCache(options)
  }

  override async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    if (this.api?.clearAllCache) {
      return this.api.clearAllCache(keepUserData)
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<IClearCacheResult>(
        INVOKE_CHANNELS.CACHE_CLEAR_ALL,
        keepUserData
      )
    }

    return super.clearAllCache(keepUserData)
  }

  dispose(): void {
    this.disposables.dispose()
  }
}
