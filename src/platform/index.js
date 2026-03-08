
import { ElectronAdapter } from './core/electron';
import { WebAdapter } from './core/web';

let instance;

function detectPlatform() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return new ElectronAdapter();
  }
  return new WebAdapter();
}

export function getPlatform() {
  if (!instance) {
    instance = detectPlatform();
  }
  return instance;
}

// Export a singleton instance for convenience
const platform = getPlatform();
export default platform;

// Helper to check if running in Electron without needing the instance
export const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
