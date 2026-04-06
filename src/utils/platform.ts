import { isWebRuntime } from './runtime'

/**
 * 平台检测工具函数
 * 用于检测当前运行环境是否为 Web 模式
 */

/**
 * 检测当前是否为 Web 模式（非 Electron 环境）
 * @returns 如果是 Web 模式返回 true，否则返回 false
 */
export function isWebMode(): boolean {
  return isWebRuntime()
}
