/**
 * Platform Service Base Implementation
 * 平台服务基类实现，提供默认方法和类型安全
 */

import type { IDisposable } from '../../base/common/lifecycle/disposable'
import { Disposable } from '../../base/common/lifecycle/disposable'
import type {
  IPlatformService,
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler,
  Platform
} from './types'
import { Platform as PlatformEnum } from './types'

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * 检测是否为移动端
 */
export function detectMobile(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  )
}

/**
 * 检测是否为 Electron 环境
 */
export function detectElectron(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.electronAPI !== 'undefined'
}

/**
 * 平台服务基类
 * 提供默认实现和类型安全
 */
export abstract class PlatformServiceBase implements IPlatformService {
  abstract readonly name: string

  // ==================== IPlatformInfoService ====================

  getPlatform(): Platform {
    if (this.isElectron()) return PlatformEnum.Electron
    if (this.isMobile()) return PlatformEnum.Mobile
    return PlatformEnum.Web
  }

  isElectron(): boolean {
    return detectElectron()
  }

  isMobile(): boolean {
    return detectMobile()
  }

  getName(): string {
    return this.name
  }

  // ==================== IWindowService ====================

  minimizeWindow(): void {
    console.warn('[PlatformService] minimizeWindow not implemented')
  }

  maximizeWindow(): void {
    console.warn('[PlatformService] maximizeWindow not implemented')
  }

  closeWindow(): void {
    console.warn('[PlatformService] closeWindow not implemented')
  }

  // ==================== IIPCService ====================

  on(_channel: string, _callback: IMessageHandler): IDisposable {
    console.warn('[PlatformService] on not implemented')
    return Disposable.NONE
  }

  send(_channel: string, _data: unknown): void {
    console.warn('[PlatformService] send not implemented')
  }

  sendPlayingState(_playing: boolean): void {
    // no-op in base class
  }

  sendPlayModeChange(_mode: string): void {
    // no-op in base class
  }

  // ==================== ICacheService ====================

  async getCacheSize(): Promise<ICacheSize> {
    return {
      httpCache: 0,
      httpCacheFormatted: '0 B'
    }
  }

  async clearCache(_options: IClearCacheOptions): Promise<IClearCacheResult> {
    return {
      failed: []
    }
  }

  async clearAllCache(_keepUserData?: boolean): Promise<IClearCacheResult> {
    return {
      failed: []
    }
  }
}

/**
 * 平台服务注册表
 * 用于管理和获取当前平台服务实例
 */
export class PlatformServiceRegistry {
  private static instance: IPlatformService | null = null

  /**
   * 注册平台服务
   */
  static register(service: IPlatformService): void {
    PlatformServiceRegistry.instance = service
  }

  /**
   * 获取当前平台服务
   */
  static get(): IPlatformService {
    if (!PlatformServiceRegistry.instance) {
      throw new Error('[PlatformServiceRegistry] No platform service registered')
    }
    return PlatformServiceRegistry.instance
  }

  /**
   * 检查是否已注册
   */
  static hasInstance(): boolean {
    return PlatformServiceRegistry.instance !== null
  }

  /**
   * 清除注册（用于测试）
   */
  static clear(): void {
    PlatformServiceRegistry.instance = null
  }
}