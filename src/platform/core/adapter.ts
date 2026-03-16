import type { CacheClearOptions, CacheClearResult } from '../../../electron/shared/protocol/cache'

export class PlatformAdapter {
  name = 'base'

  minimizeWindow(): void {
    console.warn('minimizeWindow not implemented')
  }

  maximizeWindow(): void {
    console.warn('maximizeWindow not implemented')
  }

  closeWindow(): void {
    console.warn('closeWindow not implemented')
  }

  on(_channel: string, _callback: (data: unknown) => void): () => void {
    console.warn('on not implemented')
    return () => {}
  }

  send(_channel: string, _data: unknown): void {
    console.warn('send not implemented')
  }

  sendPlayingState(_playing: boolean): void {}

  sendPlayModeChange(_mode: number): void {}

  async getCacheSize(): Promise<{ httpCache: number; httpCacheFormatted: string }> {
    return { httpCache: 0, httpCacheFormatted: '0 B' }
  }

  async clearCache(_options?: CacheClearOptions): Promise<CacheClearResult> {
    return { success: [], failed: [] }
  }

  isElectron(): boolean {
    return false
  }

  isMobile(): boolean {
    return (
      typeof window !== 'undefined' &&
      (window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))
    )
  }
}
