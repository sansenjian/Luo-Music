import type { CacheClearOptions, CacheClearResult } from '../../../electron/shared/protocol/cache'
import type { IDisposable } from '@/base/common/lifecycle/disposable'

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
  extends IWindowService, ICacheService, IIPCService, IPlatformInfoService {
  readonly name: string
}
