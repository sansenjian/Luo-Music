import { services } from '@/services'
import type { ILogger } from '@/services/loggerService'
import type { MusicPlatformAdapter } from './interface'

type MusicPlatformLoggerFactory = () => ILogger
type MusicPlatformEntry = {
  name: string
  load: () => Promise<MusicPlatformAdapter>
}

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

const platformRegistry = {
  netease: {
    name: 'Netease Music',
    load: async () => {
      const { NeteaseAdapter } = await import('./netease')
      return new NeteaseAdapter()
    }
  },
  qq: {
    name: 'QQ Music',
    load: async () => {
      const { QQMusicAdapter } = await import('./qq')
      return new QQMusicAdapter()
    }
  }
} satisfies Record<string, MusicPlatformEntry>

type SupportedPlatformId = keyof typeof platformRegistry

const supportedPlatformIds = Object.keys(platformRegistry) as SupportedPlatformId[]

const adapterPromises = new Map<SupportedPlatformId, Promise<MusicPlatformAdapter>>()

function resolvePlatformId(platform: string): SupportedPlatformId {
  if (Object.prototype.hasOwnProperty.call(platformRegistry, platform)) {
    return platform as SupportedPlatformId
  }

  getLogger().warn('Unknown music platform, falling back to netease', {
    requested: platform,
    available: supportedPlatformIds
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

  const adapterPromise = platformRegistry[platformId].load().catch(error => {
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
  return supportedPlatformIds.map(platformId => ({
    id: platformId,
    name: platformRegistry[platformId].name
  }))
}

export * from './interface'
