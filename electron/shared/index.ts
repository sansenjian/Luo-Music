/**
 * Electron 共享模块入口
 *
 * 此模块包含主进程和渲染进程共享的代码：
 * - IPC 协议定义
 * - 类型定义
 * - 通道验证工具
 */

export * from './protocol/channels'
export * from './protocol/cache'
