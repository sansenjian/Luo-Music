
import { PlatformAdapter } from './adapter';

export class ElectronAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = 'electron';
    this.api = window.electronAPI;
    
    if (!this.api) {
      console.error('Electron API not found! Is preload.js loaded?');
    }
  }

  minimizeWindow() { this.api?.minimizeWindow(); }
  maximizeWindow() { this.api?.maximizeWindow(); }
  closeWindow() { this.api?.closeWindow(); }

  on(channel, callback) {
    if (this.api?.on) {
      return this.api.on(channel, callback);
    }
    return () => {};
  }
  
  sendPlayingState(playing) { this.api?.sendPlayingState(playing); }
  sendPlayModeChange(mode) { this.api?.sendPlayModeChange(mode); }

  async getCacheSize() { return this.api?.getCacheSize(); }
  async clearCache(options) { return this.api?.clearCache(options); }
  async clearAllCache(keepUserData) { return this.api?.clearAllCache(keepUserData); }

  isElectron() { return true; }
}
