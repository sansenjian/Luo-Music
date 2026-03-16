/**
 * 配置服务代理 - 渲染进程的配置访问层
 *
 * 功能：
 * 1. 获取主进程配置
 * 2. 设置运行时配置
 * 3. 监听配置变更
 */

// 导入服务代理
import { getIpcProxy } from './ipcProxy'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels'

/**
 * 配置项类型定义
 */
export interface AppConfig {
  // 播放器配置
  playMode: 'list' | 'loop' | 'random'
  defaultVolume: number
  autoPlay: boolean

  // 歌词配置
  lyricFontSize: number
  lyricFontFamily: string
  showTranslation: boolean

  // 窗口配置
  enableDesktopLyric: boolean
  alwaysOnTop: boolean

  // 缓存配置
  cacheSize: number
  enableCache: boolean

  // 其他配置
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
}

/**
 * 配置键类型
 */
export type ConfigKey = keyof AppConfig

/**
 * 配置变更事件
 */
export interface ConfigChangeEvent {
  key: ConfigKey
  oldValue: unknown
  newValue: unknown
}

/**
 * 配置服务代理类
 *
 * 用法：
 * ```typescript
 * const configProxy = new ConfigProxy()
 *
 * // 获取配置
 * const volume = await configProxy.get('defaultVolume')
 *
 * // 设置配置
 * await configProxy.set('theme', 'dark')
 *
 * // 监听配置变更
 * configProxy.onConfigChange((event) => {
 *   console.log(`Config ${event.key} changed from ${event.oldValue} to ${event.newValue}`)
 * })
 * ```
 */
export class ConfigProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>
  private changeListeners: Set<(event: ConfigChangeEvent) => void>

  constructor() {
    this.ipcProxy = getIpcProxy()
    this.changeListeners = new Set()
  }

  /**
   * 获取配置值
   *
   * @param key - 配置键
   * @returns Promise 返回配置值
   */
  async get<T extends ConfigKey>(key: T): Promise<AppConfig[T]> {
    return this.ipcProxy.invoke<AppConfig[T]>(INVOKE_CHANNELS.CONFIG_GET, key)
  }

  /**
   * 获取所有配置
   */
  async getAll(): Promise<AppConfig> {
    return this.ipcProxy.invoke<AppConfig>(INVOKE_CHANNELS.CONFIG_GET_ALL)
  }

  /**
   * 设置配置值
   *
   * @param key - 配置键
   * @param value - 配置值
   */
  async set<T extends ConfigKey>(key: T, value: AppConfig[T]): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.CONFIG_SET, key, value)
  }

  /**
   * 删除配置
   */
  async delete(key: ConfigKey): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.CONFIG_DELETE, key)
  }

  /**
   * 重置配置为默认值
   */
  async reset(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.CONFIG_RESET)
  }

  /**
   * 监听配置变更
   *
   * @param listener - 回调函数
   * @returns 取消监听函数
   */
  onConfigChange(listener: (event: ConfigChangeEvent) => void): () => void {
    this.changeListeners.add(listener)

    const unsubscribe = this.ipcProxy.on<ConfigChangeEvent>(RECEIVE_CHANNELS.CONFIG_CHANGED, (event) => {
      listener(event)
    })

    return () => {
      this.changeListeners.delete(listener)
      unsubscribe()
    }
  }

  /**
   * 移除所有配置变更监听器
   */
  clearListeners(): void {
    this.changeListeners.clear()
  }
}

/**
 * 全局配置代理实例
 */
let globalConfigProxy: ConfigProxy | null = null

/**
 * 获取全局配置代理
 */
export function getConfigProxy(): ConfigProxy {
  if (!globalConfigProxy) {
    globalConfigProxy = new ConfigProxy()
  }
  return globalConfigProxy
}
