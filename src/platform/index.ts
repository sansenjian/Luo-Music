/**
 * Platform Module Entry Point
 * 平台模块入口，提供统一的服务访问
 */

// Types
export type {
  IPlatformService,
  IWindowService,
  ICacheService,
  IIPCService,
  IPlatformInfoService,
  ICacheSize,
  IClearCacheOptions,
  IClearCacheResult,
  IMessageHandler
} from './common/types'
export { Platform, WindowState } from './common/types'

// Base Services
export {
  PlatformServiceBase,
  PlatformServiceRegistry,
  formatBytes,
  detectMobile,
  detectElectron
} from './common/platformService'

// Platform Implementations
export { ElectronPlatformService } from './electron/electronPlatformService'
export { WebPlatformService } from './web/webPlatformService'

// Legacy Adapter (for backward compatibility)
export { PlatformAdapter } from './core/adapter'
export { ElectronAdapter } from './core/electron'
export { WebAdapter } from './core/web'

// Music Platform Adapters
export * from './music/index'

/**
 * 初始化平台服务
 * 根据当前环境自动选择合适的服务实现
 */
export function initializePlatformService(): void {
  // 避免重复初始化
  if (PlatformServiceRegistry.hasInstance()) {
    return
  }

  // 根据环境选择服务
  const isElectron = detectElectron()
  
  if (isElectron) {
    const { ElectronPlatformService } = require('./electron/electronPlatformService')
    PlatformServiceRegistry.register(new ElectronPlatformService())
  } else {
    const { WebPlatformService } = require('./web/webPlatformService')
    PlatformServiceRegistry.register(new WebPlatformService())
  }
}

/**
 * 获取平台服务实例
 * 便捷方法，等同于 PlatformServiceRegistry.get()
 */
export function getPlatformService(): IPlatformService {
  if (!PlatformServiceRegistry.hasInstance()) {
    initializePlatformService()
  }
  return PlatformServiceRegistry.get()
}

import type { IPlatformService } from './common/types'
import { PlatformServiceRegistry, detectElectron } from './common/platformService'