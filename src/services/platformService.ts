import type { IMessageHandler } from '../platform/common/types'
import { getPlatformService, initializePlatformService } from '../platform'

export type PlatformService = {
  isElectron(): boolean
  isMobile(): boolean
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  toggleDesktopLyric(show?: boolean): Promise<void>
  send(channel: string, data: unknown): void
  supportsSendChannel(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  on(channel: string, handler: (data: unknown) => void): () => void
  getCacheSize(): Promise<unknown>
  clearCache(options?: unknown): Promise<unknown>
  getServiceStatus?(serviceId: string): Promise<{ status: string; port?: number } | null>
}

type DesktopLyricWindowBridge = {
  toggleDesktopLyric?: (show?: boolean) => Promise<void> | void
}

function getDesktopLyricWindowBridge(): DesktopLyricWindowBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (
    window as Window & {
      services?: {
        window?: DesktopLyricWindowBridge
      }
    }
  ).services?.window
}

export function createPlatformService(): PlatformService {
  initializePlatformService()
  const platform = getPlatformService()

  return {
    isElectron(): boolean {
      return platform.isElectron()
    },

    isMobile(): boolean {
      return platform.isMobile()
    },

    minimizeWindow(): void {
      platform.minimizeWindow()
    },

    maximizeWindow(): void {
      platform.maximizeWindow()
    },

    closeWindow(): void {
      platform.closeWindow()
    },

    async toggleDesktopLyric(show?: boolean): Promise<void> {
      if (!platform.isElectron()) {
        return
      }

      const windowBridge = getDesktopLyricWindowBridge()
      if (typeof windowBridge?.toggleDesktopLyric === 'function') {
        await windowBridge.toggleDesktopLyric(show)
        return
      }

      if (platform.supportsSendChannel('toggle-desktop-lyric')) {
        platform.send('toggle-desktop-lyric', show)
      }
    },

    send(channel: string, data: unknown): void {
      platform.send(channel, data)
    },

    supportsSendChannel(channel: string): boolean {
      return platform.supportsSendChannel(channel)
    },

    sendPlayingState(playing: boolean): void {
      platform.sendPlayingState(playing)
    },

    sendPlayModeChange(mode: number): void {
      platform.sendPlayModeChange(mode)
    },

    on(channel: string, handler: (data: unknown) => void): () => void {
      const disposable = platform.on(channel, handler as IMessageHandler)
      return () => disposable.dispose()
    },

    getCacheSize(): Promise<unknown> {
      return platform.getCacheSize()
    },

    clearCache(options?: unknown): Promise<unknown> {
      return platform.clearCache(options as never)
    },

    async getServiceStatus(serviceId: string): Promise<{ status: string; port?: number } | null> {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            getServiceStatus?: (
              serviceId: string
            ) => Promise<{ status: string; port?: number } | null>
          }
        }
      ).electronAPI

      if (electronAPI?.getServiceStatus) {
        return electronAPI.getServiceStatus(serviceId)
      }

      return null
    }
  }
}
