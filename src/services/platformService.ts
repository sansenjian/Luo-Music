import type { IMessageHandler } from '../platform/common/types'
import { getPlatformService, initializePlatformService } from '../platform'

export type PlatformService = {
  isElectron(): boolean
  isMobile(): boolean
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  send(channel: string, data: unknown): void
  supportsSendChannel(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  on(channel: string, handler: (data: unknown) => void): () => void
  getCacheSize(): Promise<unknown>
  clearCache(options?: unknown): Promise<unknown>
  getServiceStatus?(serviceId: string): Promise<{ status: string; port?: number } | null>
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
