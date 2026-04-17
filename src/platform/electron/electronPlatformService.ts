/**
 * Electron Platform Service Implementation
 */

import type { IDisposable } from '@/base/common/lifecycle/disposable'
import { Disposable, DisposableStore } from '@/base/common/lifecycle/disposable'
import { INVOKE_CHANNELS, SEND_CHANNELS } from '../../../electron/shared/protocol/channels'
import { PlatformServiceBase } from '../common/platformService'
import type {
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from '../common/types'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'

interface IElectronAPI {
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  on(channel: string, callback: (data: unknown) => void): () => void
  send(channel: string, data: unknown): void
  supportsSendChannel?(channel: string): boolean
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  getCacheSize(): Promise<ICacheSize>
  clearCache(options?: IClearCacheOptions): Promise<IClearCacheResult>
  clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult>
}

interface IServiceBridge {
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (...args: unknown[]) => void): () => void
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  supportsSendChannel?(channel: string): boolean
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
}

export class ElectronPlatformService extends PlatformServiceBase {
  readonly name = 'electron'

  private readonly disposables = new DisposableStore()

  constructor() {
    super()
  }

  private get api(): IElectronAPI | undefined {
    return (
      window as unknown as {
        electronAPI?: IElectronAPI
      }
    ).electronAPI
  }

  private get servicesBridge(): IServiceBridge | undefined {
    return (
      window as unknown as {
        services?: IServiceBridge
      }
    ).services
  }

  override isElectron(): boolean {
    return true
  }

  override minimizeWindow(): void {
    if (this.api?.minimizeWindow) {
      this.api.minimizeWindow()
      return
    }

    this.servicesBridge?.window.minimize()
  }

  override maximizeWindow(): void {
    if (this.api?.maximizeWindow) {
      this.api.maximizeWindow()
      return
    }

    this.servicesBridge?.window.toggleMaximize()
  }

  override closeWindow(): void {
    if (this.api?.closeWindow) {
      this.api.closeWindow()
      return
    }

    this.servicesBridge?.window.close()
  }

  override on(channel: string, callback: IMessageHandler): IDisposable {
    if (this.api?.on) {
      const unsubscribe = this.api.on(channel, callback)
      const disposable = Disposable.from(() => {
        unsubscribe()
      })

      this.disposables.add(disposable)
      return disposable
    }

    if (this.servicesBridge?.on) {
      const unsubscribe = this.servicesBridge.on(channel, data => {
        callback(data)
      })
      const disposable = Disposable.from(() => {
        unsubscribe()
      })

      this.disposables.add(disposable)
      return disposable
    }

    return Disposable.none
  }

  override send(channel: string, data: unknown): void {
    if (this.api?.send) {
      this.api.send(channel, data)
      return
    }

    this.servicesBridge?.send(channel, data)
  }

  override supportsSendChannel(channel: string): boolean {
    if (this.api?.supportsSendChannel) {
      return this.api.supportsSendChannel(channel)
    }

    if (this.servicesBridge?.supportsSendChannel) {
      return this.servicesBridge.supportsSendChannel(channel)
    }

    return true
  }

  override sendPlayingState(playing: boolean): void {
    if (this.api?.sendPlayingState) {
      this.api.sendPlayingState(playing)
      return
    }

    this.servicesBridge?.send(SEND_CHANNELS.MUSIC_PLAYING_CHECK, playing)
  }

  override sendPlayModeChange(mode: number): void {
    if (this.api?.sendPlayModeChange) {
      this.api.sendPlayModeChange(mode)
      return
    }

    this.servicesBridge?.send(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, mode)
  }

  override async getCacheSize(): Promise<ICacheSize> {
    if (this.api?.getCacheSize) {
      return this.api.getCacheSize()
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<ICacheSize>(INVOKE_CHANNELS.CACHE_GET_SIZE)
    }

    return super.getCacheSize()
  }

  override async clearCache(options: IClearCacheOptions = {}): Promise<IClearCacheResult> {
    if (this.api?.clearCache) {
      return this.api.clearCache(options)
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<IClearCacheResult>(INVOKE_CHANNELS.CACHE_CLEAR, options)
    }

    return super.clearCache(options)
  }

  override async clearAllCache(keepUserData?: boolean): Promise<IClearCacheResult> {
    if (this.api?.clearAllCache) {
      return this.api.clearAllCache(keepUserData)
    }

    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<IClearCacheResult>(
        INVOKE_CHANNELS.CACHE_CLEAR_ALL,
        keepUserData
      )
    }

    return super.clearAllCache(keepUserData)
  }

  override async getLocalLibraryState(): Promise<LocalLibraryState> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryState>(INVOKE_CHANNELS.LOCAL_LIBRARY_GET_STATE)
    }

    return super.getLocalLibraryState()
  }

  override async pickLocalLibraryFolder(): Promise<string | null> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<string | null>(INVOKE_CHANNELS.LOCAL_LIBRARY_PICK_FOLDER)
    }

    return super.pickLocalLibraryFolder()
  }

  override async addLocalLibraryFolder(folderPath: string): Promise<LocalLibraryState> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryState>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_ADD_FOLDER,
        folderPath
      )
    }

    return super.addLocalLibraryFolder(folderPath)
  }

  override async removeLocalLibraryFolder(folderId: string): Promise<LocalLibraryState> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryState>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_REMOVE_FOLDER,
        folderId
      )
    }

    return super.removeLocalLibraryFolder(folderId)
  }

  override async setLocalLibraryFolderEnabled(
    folderId: string,
    enabled: boolean
  ): Promise<LocalLibraryState> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryState>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_SET_FOLDER_ENABLED,
        folderId,
        enabled
      )
    }

    return super.setLocalLibraryFolderEnabled(folderId, enabled)
  }

  override async scanLocalLibrary(): Promise<LocalLibraryState> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryState>(INVOKE_CHANNELS.LOCAL_LIBRARY_SCAN)
    }

    return super.scanLocalLibrary()
  }

  override async getLocalLibraryTracks(
    query?: LocalLibraryTrackQuery
  ): Promise<LocalLibraryPage<LocalLibraryTrack>> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryPage<LocalLibraryTrack>>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_GET_TRACKS,
        query
      )
    }

    return super.getLocalLibraryTracks()
  }

  override async getLocalLibraryArtists(
    query?: LocalLibrarySummaryQuery
  ): Promise<LocalLibraryPage<LocalLibraryArtistSummary>> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryPage<LocalLibraryArtistSummary>>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ARTISTS,
        query
      )
    }

    return super.getLocalLibraryArtists()
  }

  override async getLocalLibraryAlbums(
    query?: LocalLibrarySummaryQuery
  ): Promise<LocalLibraryPage<LocalLibraryAlbumSummary>> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<LocalLibraryPage<LocalLibraryAlbumSummary>>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ALBUMS,
        query
      )
    }

    return super.getLocalLibraryAlbums()
  }

  override async getLocalLibraryCover(coverHash: string): Promise<string | null> {
    if (this.servicesBridge?.invoke) {
      return this.servicesBridge.invoke<string | null>(
        INVOKE_CHANNELS.LOCAL_LIBRARY_GET_COVER,
        coverHash
      )
    }

    return super.getLocalLibraryCover(coverHash)
  }

  dispose(): void {
    this.disposables.dispose()
  }
}
