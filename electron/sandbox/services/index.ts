/**
 * Sandbox 服务代理统一入口
 *
 * 导出所有代理服务，供渲染进程使用
 *
 * 用法：
 * ```typescript
 * import { services } from '@/sandbox'
 *
 * // 使用代理服务
 * const state = await services.player.getState()
 * services.log.info('Player initialized')
 * const config = await services.config.get('theme')
 * ```
 */

// 导入所有服务和类型
import {
  IpcProxy,
  getIpcProxy,
  type IpcResult,
  type Channel
} from './ipcProxy'

import {
  LogProxy,
  createLogger,
  type LogLevel,
  type LogMessage
} from './logProxy'

import {
  ConfigProxy,
  getConfigProxy,
  type ConfigKey,
  type AppConfig,
  type ConfigChangeEvent
} from './configProxy'

import {
  ApiProxy,
  getApiProxy,
  type MusicPlatform,
  type SearchType,
  type SearchResult,
  type SongUrlParams,
  type LyricParams,
  type LyricResponse,
  type DetailParams
} from './apiProxy'

import {
  WindowProxy,
  getWindowProxy,
  type WindowState
} from './windowProxy'

import {
  PlayerProxy,
  getPlayerProxy,
  type PlayMode,
  type Song,
  type PlayerState,
  type LyricLine
} from './playerProxy'

import type { ServiceProxies } from './types'

// 导出所有服务
export {
  IpcProxy,
  getIpcProxy,
  type IpcResult,
  type Channel,
  LogProxy,
  createLogger,
  type LogLevel,
  type LogMessage,
  ConfigProxy,
  getConfigProxy,
  type ConfigKey,
  type AppConfig,
  type ConfigChangeEvent,
  ApiProxy,
  getApiProxy,
  type MusicPlatform,
  type SearchType,
  type SearchResult,
  type SongUrlParams,
  type LyricParams,
  type LyricResponse,
  type DetailParams,
  WindowProxy,
  getWindowProxy,
  type WindowState,
  PlayerProxy,
  getPlayerProxy,
  type PlayMode,
  type Song,
  type PlayerState,
  type LyricLine,
  type ServiceProxies
}

/**
 * 懒加载代理服务
 *
 * 使用懒加载避免循环依赖
 */
const lazyProxies: Record<string, unknown> = {}

/**
 * 获取所有服务代理
 */
export function getServices(): ServiceProxies {
  return {
    get ipc() {
      if (!lazyProxies.ipc) {
        lazyProxies.ipc = new IpcProxy()
      }
      return lazyProxies.ipc as IpcProxy
    },

    get player() {
      if (!lazyProxies.player) {
        lazyProxies.player = new PlayerProxy()
      }
      return lazyProxies.player as PlayerProxy
    },

    get api() {
      if (!lazyProxies.api) {
        lazyProxies.api = new ApiProxy()
      }
      return lazyProxies.api as ApiProxy
    },

    get config() {
      if (!lazyProxies.config) {
        lazyProxies.config = new ConfigProxy()
      }
      return lazyProxies.config as ConfigProxy
    },

    get window() {
      if (!lazyProxies.window) {
        lazyProxies.window = new WindowProxy()
      }
      return lazyProxies.window as WindowProxy
    },

    log: (module: string) => new LogProxy(module)
  }
}

/**
 * 全局服务代理实例（懒加载）
 */
export const services = getServices()
