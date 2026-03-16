import { services } from '../../services'
import type { ILogger } from '../../services/loggerService'
import type { MusicPlatformAdapter } from './interface'
import { NeteaseAdapter } from './netease'
import { QQMusicAdapter } from './qq'

// Lazy loading to avoid circular dependency
let _logger: ILogger | undefined
function getLogger() {
  if (_logger === undefined) {
    _logger = services.logger().createLogger('musicPlatform')
  }
  return _logger
}

const adapters: Record<string, MusicPlatformAdapter> = {
  netease: new NeteaseAdapter(),
  qq: new QQMusicAdapter()
}

/**
 * Get the adapter for the specified platform
 * @param platform 'netease' | 'qq'
 */
export function getMusicAdapter(platform: string): MusicPlatformAdapter {
  const adapter = adapters[platform]
  if (!adapter) {
    getLogger().warn('Unknown music platform, falling back to netease', {
      requested: platform,
      available: Object.keys(adapters)
    })
    return adapters.netease
  }

  return adapter
}

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): Array<{ id: string; name: string }> {
  return [
    { id: 'netease', name: 'Netease Music' },
    { id: 'qq', name: 'QQ Music' }
  ]
}

export { NeteaseAdapter, QQMusicAdapter }
export * from './interface'
