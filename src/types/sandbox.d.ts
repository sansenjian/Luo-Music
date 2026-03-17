/**
 * Sandbox 服务代理全局类型声明
 *
 * 此文件提供 window.services 和 window.electronAPI 的类型定义
 */

import type { ServiceAPI, ElectronAPI } from '../../electron/sandbox'

declare global {
  interface Window {
    /**
     * 新的服务代理 API（推荐）
     *
     * @example
     * ```typescript
     * // 播放控制
     * await window.services.player.play()
     * await window.services.player.pause()
     *
     * // 日志
     * const logger = window.services.createLogger('MyComponent')
     * logger.info('Initialized')
     *
     * // 配置
     * const theme = await window.services.config.get('theme')
     *
     * // API 搜索
     * const result = await window.services.api.search('周杰伦')
     * ```
     */
    services: ServiceAPI

    /**
     * 旧的 Electron API（保持向后兼容）
     *
     * @deprecated 推荐使用 window.services
     */
    electronAPI: ElectronAPI
  }
}

export {}
