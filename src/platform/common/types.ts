/**
 * Platform Service Types
 * 平台服务类型定义，借鉴 VSCode 的服务抽象模式
 */

import type { IDisposable } from '../../base/common/lifecycle/disposable'

/**
 * 平台类型枚举
 */
export const enum Platform {
  Web,
  Electron,
  Mobile
}

/**
 * 窗口状态
 */
export const enum WindowState {
  Normal = 'normal',
  Minimized = 'minimized',
  Maximized = 'maximized',
  Fullscreen = 'fullscreen'
}

/**
 * 缓存大小信息
 */
export interface ICacheSize {
  /** HTTP 缓存大小（字节） */
  httpCache: number
  /** 格式化后的缓存大小 */
  httpCacheFormatted: string
  /** 可选：其他缓存类型 */
  [key: string]: number | string
}

/**
 * 清除缓存选项
 */
export interface IClearCacheOptions {
  /** 清除 HTTP 缓存 */
  httpCache?: boolean
  /** 清除图片缓存 */
  imageCache?: boolean
  /** 清除用户数据 */
  userData?: boolean
  /** 保留用户数据 */
  keepUserData?: boolean
}

/**
 * 清除缓存结果
 */
export interface IClearCacheResult {
  /** 失败的项目列表 */
  failed: string[]
  /** 成功清除的大小（字节） */
  clearedSize?: number
}

/**
 * IPC 消息处理器
 */
export type IMessageHandler = (data: unknown) => void

/**
 * 窗口管理服务接口
 */
export interface IWindowService {
  /**
   * 最小化窗口
   */
  minimizeWindow(): void

  /**
   * 最大化窗口
   */
  maximizeWindow(): void

  /**
   * 关闭窗口
   */
  closeWindow(): void

  /**
   * 获取窗口状态
   */
  getWindowState?(): Promise<WindowState>
}

/**
 * 缓存管理服务接口
 */
export interface ICacheService {
  /**
   * 获取缓存大小
   */
  getCacheSize(): Promise<ICacheSize>

  /**
   * 清除缓存
   */
  clearCache(options: IClearCacheOptions): Promise<IClearCacheResult>

  /**
   * 清除所有缓存
   */
  clearAllCache?(keepUserData?: boolean): Promise<IClearCacheResult>
}

/**
 * IPC 服务接口
 */
export interface IIPCService {
  /**
   * 注册消息监听器
   * @param channel 通道名称
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  on(channel: string, callback: IMessageHandler): IDisposable

  /**
   * 发送消息
   * @param channel 通道名称
   * @param data 数据
   */
  send(channel: string, data: unknown): void

  /**
   * 发送播放状态
   */
  sendPlayingState(playing: boolean): void

  /**
   * 发送播放模式变更
   */
  sendPlayModeChange(mode: string): void
}

/**
 * 平台信息服务接口
 */
export interface IPlatformInfoService {
  /**
   * 获取当前平台类型
   */
  getPlatform(): Platform

  /**
   * 是否为 Electron 环境
   */
  isElectron(): boolean

  /**
   * 是否为移动端
   */
  isMobile(): boolean

  /**
   * 获取平台名称
   */
  getName(): string
}

/**
 * 平台服务聚合接口
 */
export interface IPlatformService
  extends IWindowService, ICacheService, IIPCService, IPlatformInfoService {
  /** 服务名称 */
  readonly name: string
}