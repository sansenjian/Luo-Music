import { PlatformAdapter } from './adapter'
import type { CacheClearOptions, CacheClearResult, CacheSize } from '@shared/protocol/cache'

type ElectronAPI = {
  minimizeWindow?: () => void
  maximizeWindow?: () => void
  closeWindow?: () => void
  on?: (channel: string, callback: (data: unknown) => void) => (() => void) | void
  send?: (channel: string, data: unknown) => void
  sendPlayingState?: (playing: boolean) => void
  sendPlayModeChange?: (mode: number) => void
  getCacheSize?: () => Promise<CacheSize>
  clearCache?: (options?: CacheClearOptions) => Promise<CacheClearResult>
  clearAllCache?: (keepUserData?: boolean) => Promise<CacheClearResult>
}

export class ElectronAdapter extends PlatformAdapter {
  override name = 'electron'
  private readonly api: ElectronAPI | undefined

  constructor() {
    super()
    this.api = (window as typeof window & { electronAPI?: ElectronAPI }).electronAPI

    if (!this.api) {
      console.error('Electron API not found! Is preload script loaded?')
    }
  }

  override minimizeWindow(): void {
    this.api?.minimizeWindow?.()
  }

  override maximizeWindow(): void {
    this.api?.maximizeWindow?.()
  }

  override closeWindow(): void {
    this.api?.closeWindow?.()
  }

  override on(channel: string, callback: (data: unknown) => void): () => void {
    return this.api?.on?.(channel, callback) ?? (() => {})
  }

  override send(channel: string, data: unknown): void {
    this.api?.send?.(channel, data)
  }

  override sendPlayingState(playing: boolean): void {
    this.api?.sendPlayingState?.(playing)
  }

  override sendPlayModeChange(mode: number): void {
    this.api?.sendPlayModeChange?.(mode)
  }

  override async getCacheSize(): Promise<CacheSize> {
    return this.api?.getCacheSize?.() ?? super.getCacheSize()
  }

  override async clearCache(options?: CacheClearOptions): Promise<CacheClearResult> {
    return this.api?.clearCache?.(options) ?? super.clearCache(options)
  }

  async clearAllCache(keepUserData?: boolean): Promise<CacheClearResult> {
    return this.api?.clearAllCache?.(keepUserData) ?? { success: [], failed: [] }
  }

  override isElectron(): boolean {
    return true
  }
}
