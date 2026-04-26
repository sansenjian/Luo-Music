import { services } from '@/services'
import type { ILogger } from '@/services/loggerService'
import type { MusicPlatformAdapter } from './interface'
import { getPlatformDescriptor, getPlatformDescriptors } from './descriptors'
import { builtInAdapterLoader } from './plugin/BuiltInAdapterLoader'
import { externalAdapterProxyFactory } from './plugin/ExternalAdapterProxy'

export * from './descriptors'

type MusicPlatformLoggerFactory = () => ILogger

type ResolveMusicPlatformAdapter = (platformId: string) => Promise<MusicPlatformAdapter>

type ResolvedPlatform =
  | {
      platformId: string
      kind: 'local'
    }
  | {
      platformId: string
      kind: 'external'
    }

const defaultMusicPlatformLoggerFactory: MusicPlatformLoggerFactory = () =>
  services.logger().createLogger('musicPlatform')

const defaultResolveMusicPlatformAdapter: ResolveMusicPlatformAdapter = platformId =>
  builtInAdapterLoader.load(platformId)

let createMusicPlatformLogger: MusicPlatformLoggerFactory = defaultMusicPlatformLoggerFactory
let resolveMusicPlatformAdapter: ResolveMusicPlatformAdapter = defaultResolveMusicPlatformAdapter
let loggerInstance: ILogger | undefined

function getLogger(): ILogger {
  if (loggerInstance === undefined) {
    loggerInstance = createMusicPlatformLogger()
  }

  return loggerInstance
}

function getAdapterBackedPlatformIds(): string[] {
  return getPlatformDescriptors()
    .filter(descriptor => descriptor.enabled)
    .map(descriptor => descriptor.id)
}

const adapterPromises = new Map<string, Promise<MusicPlatformAdapter>>()

export function configureMusicPlatformDeps(deps: {
  createLogger?: MusicPlatformLoggerFactory
  resolveAdapter?: ResolveMusicPlatformAdapter
}): void {
  if (deps.createLogger) {
    createMusicPlatformLogger = deps.createLogger
    loggerInstance = undefined
  }

  if (deps.resolveAdapter) {
    resolveMusicPlatformAdapter = deps.resolveAdapter
    adapterPromises.clear()
  }
}

export function resetMusicPlatformDeps(): void {
  createMusicPlatformLogger = defaultMusicPlatformLoggerFactory
  resolveMusicPlatformAdapter = defaultResolveMusicPlatformAdapter
  loggerInstance = undefined
  adapterPromises.clear()
}

function resolvePlatform(platformId: string): ResolvedPlatform {
  const descriptor = getPlatformDescriptor(platformId)
  const available = getAdapterBackedPlatformIds()

  if (!descriptor) {
    getLogger().warn('Music platform is not registered', {
      requested: platformId,
      available
    })
    throw new Error(`Music platform "${platformId}" is not registered`)
  }

  if (!descriptor.enabled) {
    getLogger().warn('Music platform is disabled', {
      requested: platformId,
      available
    })
    throw new Error(`Music platform "${platformId}" is disabled`)
  }

  if (descriptor.runtime === 'local' && descriptor.source !== 'external') {
    return {
      platformId,
      kind: 'local'
    }
  }

  if (descriptor.runtime === 'external-host' && descriptor.source === 'external') {
    return {
      platformId,
      kind: 'external'
    }
  }

  getLogger().warn('Music platform adapter is unavailable for this descriptor', {
    requested: platformId,
    runtime: descriptor.runtime,
    source: descriptor.source,
    enabled: descriptor.enabled,
    available
  })
  throw new Error(`Music platform "${platformId}" does not provide a supported adapter`)
}

export function getMusicAdapter(platformId: string): Promise<MusicPlatformAdapter> {
  let resolvedPlatform: ResolvedPlatform

  try {
    resolvedPlatform = resolvePlatform(platformId)
  } catch (error) {
    return Promise.reject(error)
  }

  const existingAdapterPromise = adapterPromises.get(resolvedPlatform.platformId)
  if (existingAdapterPromise) {
    return existingAdapterPromise
  }

  const adapterPromise =
    resolvedPlatform.kind === 'local'
      ? resolveMusicPlatformAdapter(resolvedPlatform.platformId)
      : Promise.resolve(
          externalAdapterProxyFactory.get(
            resolvedPlatform.platformId,
            getPlatformDescriptor(resolvedPlatform.platformId)?.capabilities ?? {
              search: false,
              songUrl: false,
              songDetail: false,
              lyric: false,
              playlistDetail: false,
              needsHydration: false,
              supportsLyricFetch: false,
              supportsUrlRefreshOnFailure: false
            }
          )
        )

  const trackedAdapterPromise = adapterPromise.catch(error => {
    adapterPromises.delete(resolvedPlatform.platformId)
    throw error
  })

  adapterPromises.set(resolvedPlatform.platformId, trackedAdapterPromise)
  return trackedAdapterPromise
}

export function getAvailablePlatforms(): Array<{ id: string; name: string }> {
  return getPlatformDescriptors()
    .filter(descriptor => descriptor.enabled)
    .map(descriptor => ({
      id: descriptor.id,
      name: descriptor.displayName
    }))
}

export * from './interface'
