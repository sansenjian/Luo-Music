/**
 * 播放器 Store 模块
 *
 * 重构后的架构：
 * - playerState.ts - 纯状态定义
 * - audioEvents.ts - 音频事件处理
 * - playbackActions.ts - 播放业务逻辑
 * - ipcHandlers.ts - IPC 通信处理
 */

export * from './playerState'
export * from './audioEvents'
export * from './playbackActions'
export * from './ipcHandlers'
