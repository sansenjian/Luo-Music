import type { IMessageHandler } from '../platform/common/types'
import { getPlatformService, initializePlatformService } from '../platform'

export type PlatformService = {
  isElectron(): boolean
  send(channel: string, data: unknown): void
  on(channel: string, handler: (data: unknown) => void): () => void
  getCacheSize(): Promise<unknown>
  clearCache(options?: unknown): Promise<unknown>
  getServiceStatus?(serviceId: string): Promise<{ port?: number } | null>
}

export function createPlatformService(): PlatformService {
  initializePlatformService()
  const platform = getPlatformService()

  return {
    isElectron(): boolean {
      return platform.isElectron()
    },

    send(channel: string, data: unknown): void {
      platform.send(channel, data)
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

    async getServiceStatus(serviceId: string): Promise<{ port?: number } | null> {
      const electronAPI = (
        window as unknown as {
          electronAPI?: {
            getServiceStatus?: (serviceId: string) => Promise<{ port?: number } | null>
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
