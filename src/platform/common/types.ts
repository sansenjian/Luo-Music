import type { CacheClearOptions, CacheClearResult } from '../../../electron/shared/protocol/cache'
import type { IDisposable } from '@/base/common/lifecycle/disposable'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'

export const enum Platform {
  Web,
  Electron,
  Mobile
}

export const enum WindowState {
  Normal = 'normal',
  Minimized = 'minimized',
  Maximized = 'maximized',
  Fullscreen = 'fullscreen'
}

export interface ICacheSize {
  httpCache: number
  httpCacheFormatted: string
  [key: string]: number | string
}

export type IClearCacheOptions = CacheClearOptions

export type IClearCacheResult = CacheClearResult

export type IMessageHandler = (data: unknown) => void

export interface IWindowService {
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  getWindowState?(): Promise<WindowState>
}

export interface ICacheService {
  getCacheSize(): Promise<ICacheSize>
  clearCache(options: IClearCacheOptions): Promise<IClearCacheResult>
  clearAllCache?(keepUserData?: boolean): Promise<IClearCacheResult>
}

export interface ILocalLibraryService {
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
}

export interface IIPCService {
  on(channel: string, callback: IMessageHandler): IDisposable
  send(channel: string, data: unknown): void
  supportsSendChannel(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
}

export interface IPlatformInfoService {
  getPlatform(): Platform
  isElectron(): boolean
  isMobile(): boolean
  getName(): string
}

export interface IPlatformService
  extends IWindowService, ICacheService, IIPCService, ILocalLibraryService, IPlatformInfoService {
  readonly name: string
}
