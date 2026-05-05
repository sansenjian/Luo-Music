import type { PlatformDescriptor } from '@/platform/music/descriptors'
import type {
  DesktopLyricSnapshot,
  InvokeChannel,
  PlayerStateResponse,
  ReceiveChannel,
  SendChannel,
  ServiceStatusResponse
} from '@/platform/contracts/ipc'
import type { CacheClearOptions, CacheClearResult } from '@/platform/contracts/protocol/cache'
import type { AppConfig, ConfigChangeEvent, ConfigKey } from '@/platform/contracts/config'
import type { LyricLine } from '@/utils/player/core/lyric'
import type { PlayMode } from '@/types/player'
import type { Song, SongPlatform } from '@/types/schemas'

export type IpcChannel = InvokeChannel | SendChannel | ReceiveChannel

export interface LoggerServiceAPI {
  trace(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  errorWithStack(error: Error, context?: string): void
}

export interface ConfigServiceAPI {
  get<K extends ConfigKey>(key: K): Promise<AppConfig[K]>
  getAll(): Promise<AppConfig>
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void>
  delete(key: ConfigKey): Promise<void>
  reset(key?: ConfigKey): Promise<void>
  onConfigChange(listener: (event: ConfigChangeEvent) => void): () => void
}

export interface ApiServiceAPI {
  search(
    keyword: string,
    type?: string,
    platform?: 'netease' | 'qq',
    page?: number,
    limit?: number
  ): Promise<unknown>
  getSongUrl(params: {
    id: string | number
    platform?: 'netease' | 'qq'
    quality?: number
    mediaId?: string
  }): Promise<string>
  getLyric(params: {
    id: string | number
    platform?: 'netease' | 'qq'
  }): Promise<{ lyric?: string; translated?: string; romalrc?: string; error?: string }>
  getSongDetail(params: { id: string | number; platform?: 'netease' | 'qq' }): Promise<unknown>
  getPlaylistDetail(id: string | number, platform?: 'netease' | 'qq'): Promise<unknown>
  getArtistDetail(id: string | number, platform?: 'netease' | 'qq'): Promise<unknown>
  getAlbumDetail(id: string | number, platform?: 'netease' | 'qq'): Promise<unknown>
  getRecommendedPlaylists(platform?: 'netease' | 'qq', limit?: number): Promise<unknown>
  getChart(platform?: 'netease' | 'qq', id?: string): Promise<unknown>
}

export interface WindowServiceAPI {
  minimize(): void
  toggleMaximize(): void
  close(): void
  minimizeToTray(): void
  setAlwaysOnTop(alwaysOnTop: boolean): void
  toggleFullScreen(): void
  getState(): Promise<{
    isMaximized: boolean
    isMinimized: boolean
    isFullScreen: boolean
    isAlwaysOnTop: boolean
  }>
  isMaximized(): Promise<boolean>
  isMinimized(): Promise<boolean>
  isFullScreen(): Promise<boolean>
  restore(): void
  show(): void
  hide(): void
  toggleDesktopLyric(show?: boolean): void
  setDesktopLyricOnTop(alwaysOnTop: boolean): void
  lockDesktopLyric(locked: boolean): void
}

export interface PlayerServiceAPI {
  play(): Promise<void>
  pause(): Promise<void>
  toggle(): Promise<void>
  playSong(song: Song, playlist?: Song[]): Promise<void>
  playSongById(id: string | number, platform?: SongPlatform): Promise<void>
  skipToPrevious(): Promise<void>
  skipToNext(): Promise<void>
  seekTo(time: number): Promise<void>
  setVolume(volume: number): Promise<void>
  toggleMute(): Promise<void>
  setPlayMode(mode: PlayMode): Promise<void>
  togglePlayMode(): Promise<void>
  getState(): Promise<PlayerStateResponse>
  getCurrentSong(): Promise<Song | null>
  getPlaylist(): Promise<Song[]>
  getDesktopLyricSnapshot(): Promise<DesktopLyricSnapshot>
  addToNext(song: Song): Promise<void>
  removeFromPlaylist(index: number): Promise<void>
  clearPlaylist(): Promise<void>
  getLyric(songId?: string | number, platform?: SongPlatform): Promise<LyricLine[]>
  onPlayStateChange(
    listener: (data: { isPlaying: boolean; currentTime: number }) => void
  ): () => void
  onSongChange(listener: (data: { song: Song | null; index: number }) => void): () => void
  onLyricUpdate(listener: (data: { index: number; line: LyricLine | null }) => void): () => void
  onDesktopLyricState(listener: (data: DesktopLyricSnapshot) => void): () => void
  onPlayError(listener: (data: { error: string; song: Song | null }) => void): () => void
}

export interface PluginServiceAPI {
  list(): Promise<PlatformDescriptor[]>
  installFromPath(pluginPath: string): Promise<PlatformDescriptor[]>
  pickInstallPath(): Promise<string | null>
  setEnabled(platformId: string, enabled: boolean): Promise<PlatformDescriptor[]>
  uninstall(platformId: string): Promise<PlatformDescriptor[]>
  getSettings(platformId: string): Promise<Record<string, unknown>>
  updateSettings(
    platformId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  call(platformId: string, method: string, payload: unknown): Promise<unknown>
  onChanged(listener: (platforms: PlatformDescriptor[]) => void): () => void
}

export interface ServiceAPI {
  invoke<T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T>
  send(channel: IpcChannel, ...args: unknown[]): void
  on(channel: IpcChannel, callback: (...args: unknown[]) => void): () => void
  once(channel: IpcChannel, callback: (...args: unknown[]) => void): void
  removeListener(channel: IpcChannel, callback: (...args: unknown[]) => void): void
  removeAllListeners(channel?: IpcChannel): void
  supportsSendChannel(channel: string): channel is SendChannel
  createLogger(module: string): LoggerServiceAPI
  config: ConfigServiceAPI
  api: ApiServiceAPI
  window: WindowServiceAPI
  player: PlayerServiceAPI
  plugins: PluginServiceAPI
}

export interface ElectronAPI {
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  resizeWindow(dims: { width: number; height: number }): void
  getCacheSize(): Promise<{ httpCache: number; httpCacheFormatted: string; note?: string }>
  clearCache(options?: CacheClearOptions): Promise<CacheClearResult>
  clearAllCache(keepUserData?: boolean): Promise<CacheClearResult>
  getCachePaths(): Promise<Record<string, string>>
  apiRequest<T = unknown>(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<T>
  getServices(): Promise<string[]>
  getServiceStatus(serviceId: string): Promise<ServiceStatusResponse>
  startService(serviceId: string): Promise<void>
  stopService(serviceId: string): Promise<void>
  sendPlayingState(playing: boolean): void
  sendPlayModeChange(mode: number): void
  supportsSendChannel(channel: string): boolean
  moveWindow(x: number, y: number): void
  send(channel: string, data: unknown): void
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}
