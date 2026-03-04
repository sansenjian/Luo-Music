
/**
 * Platform Adapter Interface
 * Defines the contract for platform-specific implementations.
 */
export class PlatformAdapter {
  constructor() {
    this.name = 'base';
  }

  // Window Management
  minimizeWindow() { console.warn('minimizeWindow not implemented'); }
  maximizeWindow() { console.warn('maximizeWindow not implemented'); }
  closeWindow() { console.warn('closeWindow not implemented'); }

  // IPC / Events
  on(channel, callback) { 
    console.warn('on not implemented'); 
    return () => {}; // Return cleanup function
  }
  
  sendPlayingState(playing) { /* no-op */ }
  sendPlayModeChange(mode) { /* no-op */ }

  // Cache Management
  async getCacheSize() { return { httpCache: 0, httpCacheFormatted: '0 B' }; }
  async clearCache(options) { return { failed: [] }; }

  // Environment Check
  isElectron() { return false; }
  isMobile() {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
}
