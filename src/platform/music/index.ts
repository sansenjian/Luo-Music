
import { NeteaseAdapter } from './netease';
import { QQMusicAdapter } from './qq';
import type { MusicPlatformAdapter } from './interface';

const adapters: Record<string, MusicPlatformAdapter> = {
  netease: new NeteaseAdapter(),
  qq: new QQMusicAdapter()
};

/**
 * Get the adapter for the specified platform
 * @param platform 'netease' | 'qq'
 */
export function getMusicAdapter(platform: string): MusicPlatformAdapter {
  console.log(`[getMusicAdapter] Requested platform: '${platform}', type: ${typeof platform}`);
  const adapter = adapters[platform];
  if (!adapter) {
    console.warn(`[getMusicAdapter] Adapter for platform '${platform}' not found, available: ${Object.keys(adapters).join(', ')}`);
    console.warn(`[getMusicAdapter] Falling back to netease`);
    return adapters.netease;
  }
  console.log(`[getMusicAdapter] Found adapter: ${adapter.constructor.name}`);
  return adapter;
}

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): Array<{id: string, name: string}> {
  return [
    { id: 'netease', name: '网易云音乐' },
    { id: 'qq', name: 'QQ音乐' }
  ];
}

// Export adapters directly if needed
export { NeteaseAdapter, QQMusicAdapter };
export * from './interface';
