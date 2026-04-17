import type { IMessageHandler } from '../platform/common/types'
import { getPlatformService, initializePlatformService } from '../platform'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'

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
  getLocalLibraryState(): Promise<LocalLibraryState>
  pickLocalLibraryFolder(): Promise<string | null>
  addLocalLibraryFolder(folderPath: string): Promise<LocalLibraryState>
  removeLocalLibraryFolder(folderId: string): Promise<LocalLibraryState>
  setLocalLibraryFolderEnabled(folderId: string, enabled: boolean): Promise<LocalLibraryState>
  scanLocalLibrary(): Promise<LocalLibraryState>
  getLocalLibraryTracks(
    query?: LocalLibraryTrackQuery
  ): Promise<LocalLibraryPage<LocalLibraryTrack>>
  getLocalLibraryArtists(
    query?: LocalLibrarySummaryQuery
  ): Promise<LocalLibraryPage<LocalLibraryArtistSummary>>
  getLocalLibraryAlbums(
    query?: LocalLibrarySummaryQuery
  ): Promise<LocalLibraryPage<LocalLibraryAlbumSummary>>
  getLocalLibraryCover(coverHash: string): Promise<string | null>
  getServiceStatus?(serviceId: string): Promise<{ status: string; port?: number } | null>
}

type DesktopLyricWindowBridge = {
  toggleDesktopLyric?: (show?: boolean) => Promise<void> | void
}

type ElectronStatusApi = {
  getServiceStatus?: (serviceId: string) => Promise<{ status: string; port?: number } | null>
}

export type PlatformServiceDeps = {
  initializePlatformService?: typeof initializePlatformService
  getPlatformService?: typeof getPlatformService
  getDesktopLyricWindowBridge?: () => DesktopLyricWindowBridge | undefined
  getElectronApi?: () => ElectronStatusApi | undefined
}

function resolveDesktopLyricWindowBridge(): DesktopLyricWindowBridge | undefined {
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

function resolveElectronApi(): ElectronStatusApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as unknown as { electronAPI?: ElectronStatusApi }).electronAPI
}

export function createPlatformService(deps: PlatformServiceDeps = {}): PlatformService {
  const initializePlatform = deps.initializePlatformService ?? initializePlatformService
  const getPlatform = deps.getPlatformService ?? getPlatformService
  const getDesktopBridge = deps.getDesktopLyricWindowBridge ?? resolveDesktopLyricWindowBridge
  const getElectronApi = deps.getElectronApi ?? resolveElectronApi

  initializePlatform()
  const platform = getPlatform()

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

      const windowBridge = getDesktopBridge()
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

    getLocalLibraryState(): Promise<LocalLibraryState> {
      return platform.getLocalLibraryState()
    },

    pickLocalLibraryFolder(): Promise<string | null> {
      return platform.pickLocalLibraryFolder()
    },

    addLocalLibraryFolder(folderPath: string): Promise<LocalLibraryState> {
      return platform.addLocalLibraryFolder(folderPath)
    },

    removeLocalLibraryFolder(folderId: string): Promise<LocalLibraryState> {
      return platform.removeLocalLibraryFolder(folderId)
    },

    setLocalLibraryFolderEnabled(folderId: string, enabled: boolean): Promise<LocalLibraryState> {
      return platform.setLocalLibraryFolderEnabled(folderId, enabled)
    },

    scanLocalLibrary(): Promise<LocalLibraryState> {
      return platform.scanLocalLibrary()
    },

    getLocalLibraryTracks(
      query?: LocalLibraryTrackQuery
    ): Promise<LocalLibraryPage<LocalLibraryTrack>> {
      return platform.getLocalLibraryTracks(query)
    },

    getLocalLibraryArtists(
      query?: LocalLibrarySummaryQuery
    ): Promise<LocalLibraryPage<LocalLibraryArtistSummary>> {
      return platform.getLocalLibraryArtists(query)
    },

    getLocalLibraryAlbums(
      query?: LocalLibrarySummaryQuery
    ): Promise<LocalLibraryPage<LocalLibraryAlbumSummary>> {
      return platform.getLocalLibraryAlbums(query)
    },

    getLocalLibraryCover(coverHash: string): Promise<string | null> {
      return platform.getLocalLibraryCover(coverHash)
    },

    async getServiceStatus(serviceId: string): Promise<{ status: string; port?: number } | null> {
      const electronAPI = getElectronApi()

      if (electronAPI?.getServiceStatus) {
        return electronAPI.getServiceStatus(serviceId)
      }

      return null
    }
  }
}
