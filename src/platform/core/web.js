
import { PlatformAdapter } from './adapter';

export class WebAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = 'web';
  }

  // Override specific methods for Web
  minimizeWindow() { /* Browser default */ }
  maximizeWindow() { /* Browser default */ }
  closeWindow() { /* Browser default */ }

  on(channel, callback) { 
    // Web implementation could use window.addEventListener for custom events if needed
    // But for IPC events, it's mostly no-op
    return () => {};
  }
  
  // Cache Management - potentially use Cache API or LocalStorage
  // For now, keep as no-op or basic implementation if needed
  async getCacheSize() {
    // Could estimate storage usage
    if (navigator.storage && navigator.storage.estimate) {
        const quota = await navigator.storage.estimate();
        return { 
            httpCache: quota.usage || 0, 
            httpCacheFormatted: this.formatBytes(quota.usage || 0) 
        };
    }
    return super.getCacheSize();
  }

  formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
  }

  isElectron() { return false; }
}
