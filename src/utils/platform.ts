/**
 * 平台检测工具函数
 * 用于检测当前运行环境是否为 Web 模式
 */

/**
 * 检测当前是否为 Web 模式（非 Electron 环境）
 * @returns 如果是 Web 模式返回 true，否则返回 false
 */
export function isWebMode(): boolean {
  // 在非浏览器环境中，window 未定义
  if (typeof window === 'undefined') {
    return false
  }

  // 检查 userAgent 是否包含 Electron 标识
  return !window.navigator.userAgent.includes('Electron')
}
