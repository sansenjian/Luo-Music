import { PlatformServiceRegistry, detectElectron } from './common/platformService'
import type {
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler,
  IPlatformService
} from './common/types'
import { Platform } from './common/types'
import { ElectronPlatformService } from './electron/electronPlatformService'
import { WebPlatformService } from './web/webPlatformService'

export type {
  IPlatformService,
  IWindowService,
  ICacheService,
  IIPCService,
  IPlatformInfoService,
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from './common/types'
export { Platform, WindowState } from './common/types'
export {
  PlatformServiceBase,
  PlatformServiceRegistry,
  formatBytes,
  detectMobile,
  detectElectron
} from './common/platformService'
export { ElectronPlatformService } from './electron/electronPlatformService'
export { WebPlatformService } from './web/webPlatformService'
export { PlatformAdapter } from './core/adapter'
export { ElectronAdapter } from './core/electron'
export { WebAdapter } from './core/web'
export * from './music/index'

function createPlatformService(): IPlatformService {
  return detectElectron() ? new ElectronPlatformService() : new WebPlatformService()
}

export function initializePlatformService(): void {
  if (!PlatformServiceRegistry.hasInstance()) {
    PlatformServiceRegistry.register(createPlatformService())
  }
}

export function getPlatformService(): IPlatformService {
  if (!PlatformServiceRegistry.hasInstance()) {
    initializePlatformService()
  }

  return PlatformServiceRegistry.get()
}

export const isElectron = detectElectron()

type LegacyCacheOptions = IClearCacheOptions & Record<string, unknown>

type LegacyPlatform = {
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  on<T = unknown>(channel: string, callback: (data: T) => void): () => void
  send(channel: string, data: unknown): void
  supportsSendChannel(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  getPlatform(): Platform
  isElectron(): boolean
  isMobile(): boolean
  getName(): string
  getCacheSize(): Promise<ICacheSize>
  clearCache(options?: LegacyCacheOptions): Promise<IClearCacheResult>
  clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult>
}

const platform: LegacyPlatform = {
  minimizeWindow(): void {
    getPlatformService().minimizeWindow()
  },

  maximizeWindow(): void {
    getPlatformService().maximizeWindow()
  },

  closeWindow(): void {
    getPlatformService().closeWindow()
  },

  on<T = unknown>(channel: string, callback: (data: T) => void): () => void {
    const disposable = getPlatformService().on(channel, callback as IMessageHandler)
    return () => disposable.dispose()
  },

  send(channel: string, data: unknown): void {
    getPlatformService().send(channel, data)
  },

  supportsSendChannel(channel: string): boolean {
    return getPlatformService().supportsSendChannel(channel)
  },

  sendPlayingState(playing: boolean): void {
    getPlatformService().sendPlayingState(playing)
  },

  sendPlayModeChange(mode: number): void {
    getPlatformService().sendPlayModeChange(mode)
  },

  getPlatform(): Platform {
    return getPlatformService().getPlatform()
  },

  isElectron(): boolean {
    return getPlatformService().isElectron()
  },

  isMobile(): boolean {
    return getPlatformService().isMobile()
  },

  getName(): string {
    return getPlatformService().getName()
  },

  async getCacheSize(): Promise<ICacheSize> {
    return getPlatformService().getCacheSize()
  },

  async clearCache(options: LegacyCacheOptions = {}): Promise<IClearCacheResult> {
    return getPlatformService().clearCache(options as IClearCacheOptions)
  },

  async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    return (
      (await getPlatformService().clearAllCache?.(keepUserData)) ??
      getPlatformService().clearCache(
        keepUserData
          ? {
              cookies: true,
              sessionStorage: true,
              cache: true,
              serviceWorkers: true,
              shaderCache: true
            }
          : { all: true }
      )
    )
  }
}

export default platform
