import { PlatformAdapter } from './adapter'

export class WebAdapter extends PlatformAdapter {
  override name = 'web'

  override minimizeWindow(): void {}

  override maximizeWindow(): void {}

  override closeWindow(): void {}

  override on(_channel: string, _callback: (data: unknown) => void): () => void {
    return () => {}
  }

  override async getCacheSize(): Promise<{ httpCache: number; httpCacheFormatted: string }> {
    if (navigator.storage?.estimate) {
      const quota = await navigator.storage.estimate()
      const usage = quota.usage || 0

      return {
        httpCache: usage,
        httpCacheFormatted: this.formatBytes(usage)
      }
    }

    return super.getCacheSize()
  }

  private formatBytes(bytes: number, decimals = 2): string {
    if (!bytes) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
  }
}
