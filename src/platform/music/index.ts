import { services } from '@/services'
import type { ILogger } from '@/services/loggerService'
import type { MusicPlatformAdapter } from './interface'

type MusicPlatformLoggerFactory = () => ILogger
type SupportedPlatformId = 'netease' | 'qq'

const defaultMusicPlatformLoggerFactory: MusicPlatformLoggerFactory = () =>
  services.logger().createLogger('musicPlatform')

let createMusicPlatformLogger: MusicPlatformLoggerFactory = defaultMusicPlatformLoggerFactory

export function configureMusicPlatformDeps(deps: {
  createLogger?: MusicPlatformLoggerFactory
}): void {
  if (deps.createLogger) {
    createMusicPlatformLogger = deps.createLogger
    _logger = undefined
  }
}

export function resetMusicPlatformDeps(): void {
  createMusicPlatformLogger = defaultMusicPlatformLoggerFactory
  _logger = undefined
}

// Lazy loading to avoid circular dependency
let _logger: ILogger | undefined
function getLogger() {
  if (_logger === undefined) {
    _logger = createMusicPlatformLogger()
  }
  return _logger
}

const adapterLoaders: Record<SupportedPlatformId, () => Promise<MusicPlatformAdapter>> = {
  netease: async () => {
    const { NeteaseAdapter } = await import('./netease')
    return new NeteaseAdapter()
  },
  qq: async () => {
    const { QQMusicAdapter } = await import('./qq')
    return new QQMusicAdapter()
  }
}

const adapterPromises = new Map<SupportedPlatformId, Promise<MusicPlatformAdapter>>()

function resolvePlatformId(platform: string): SupportedPlatformId {
  if (Object.prototype.hasOwnProperty.call(adapterLoaders, platform)) {
    return platform as SupportedPlatformId
  }

  getLogger().warn('Unknown music platform, falling back to netease', {
    requested: platform,
    available: Object.keys(adapterLoaders)
  })
  return 'netease'
}

/**
 * Get the adapter for the specified platform
 * @param platform 'netease' | 'qq'
 */
export function getMusicAdapter(platform: string): Promise<MusicPlatformAdapter> {
  const platformId = resolvePlatformId(platform)
  const existingAdapterPromise = adapterPromises.get(platformId)

  if (existingAdapterPromise) {
    return existingAdapterPromise
  }

  const adapterPromise = adapterLoaders[platformId]().catch(error => {
    adapterPromises.delete(platformId)
    throw error
  })

  adapterPromises.set(platformId, adapterPromise)
  return adapterPromise
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

export * from './interface'
