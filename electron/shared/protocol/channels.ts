/**
 * IPC 通道常量定义
 * 
 * 集中管理所有 IPC 通道名称，便于维护和类型检查。
 * 遵循 VSCode 的 Protocol 模式，将通道分为三类：
 * - Invoke: 双向通信，渲染进程调用并等待结果
 * - Send: 单向通信，渲染进程发送消息到主进程
 * - Receive: 单向通信，主进程推送消息到渲染进程
 */

/**
 * Invoke 通道 - 双向通信
 * 渲染进程调用并等待主进程返回结果
 */
export const INVOKE_CHANNELS = {
  // 缓存管理
  CACHE_GET_SIZE: 'cache:get-size',
  CACHE_CLEAR: 'cache:clear',
  CACHE_CLEAR_ALL: 'cache:clear-all',
  CACHE_GET_PATHS: 'cache:get-paths',

  // API 网关
  API_REQUEST: 'api:request',
  API_GET_SERVICES: 'api:services',

  // 服务管理
  SERVICE_GET_STATUS: 'service:status',
  SERVICE_START: 'service:start',
  SERVICE_STOP: 'service:stop',
} as const

/**
 * Send 通道 - 单向通信（渲染进程 -> 主进程）
 * 渲染进程发送消息，不等待返回结果
 */
export const SEND_CHANNELS = {
  // 窗口控制
  WINDOW_MINIMIZE: 'minimize-window',
  WINDOW_MAXIMIZE: 'maximize-window',
  WINDOW_CLOSE: 'close-window',
  WINDOW_RESIZE: 'resize-window',

  // 桌面歌词
  DESKTOP_LYRIC_TOGGLE: 'toggle-desktop-lyric',
  DESKTOP_LYRIC_CONTROL: 'desktop-lyric-control',
  DESKTOP_LYRIC_TOGGLE_LOCK: 'toggle-desktop-lyric-lock',
  DESKTOP_LYRIC_MOVE: 'desktop-lyric-move',
  DESKTOP_LYRIC_SET_IGNORE_MOUSE: 'desktop-lyric-set-ignore-mouse',

  // 歌词同步
  LYRIC_SYNC: 'sync-lyric',
  LYRIC_TIME_UPDATE: 'lyric-time-update',

  // 下载
  DOWNLOAD_MUSIC: 'download-music',

  // 播放器状态
  MUSIC_PLAYING_CHECK: 'music-playing-check',
  MUSIC_PLAYMODE_TRAY_CHANGE: 'music-playmode-tray-change',

  // 日志
  LOG_MESSAGE: 'log-message',
} as const

/**
 * Receive 通道 - 单向通信（主进程 -> 渲染进程）
 * 主进程推送消息到渲染进程
 */
export const RECEIVE_CHANNELS = {
  // 通用消息
  MAIN_PROCESS_MESSAGE: 'main-process-message',

  // 缓存
  CACHE_CLEARED: 'cache-cleared',

  // 播放器控制
  MUSIC_PLAYING_CONTROL: 'music-playing-control',
  MUSIC_SONG_CONTROL: 'music-song-control',
  MUSIC_PLAYMODE_CONTROL: 'music-playmode-control',
  MUSIC_VOLUME_UP: 'music-volume-up',
  MUSIC_VOLUME_DOWN: 'music-volume-down',
  MUSIC_PROCESS_CONTROL: 'music-process-control',
  MUSIC_COMPACT_MODE_CONTROL: 'music-compact-mode-control',

  // 界面
  HIDE_PLAYER: 'hide-player',

  // 歌词
  LYRIC_UPDATE: 'lyric-update',
  LYRIC_TIME_UPDATE: 'lyric-time-update',
  DESKTOP_LYRIC_LOCK_STATE: 'desktop-lyric-lock-state',

  // 下载
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_FAILED: 'download-failed',
} as const

/**
 * 所有有效的通道名称
 * 用于验证通道合法性
 */
export const VALID_SEND_CHANNELS = Object.values(SEND_CHANNELS)
export const VALID_RECEIVE_CHANNELS = Object.values(RECEIVE_CHANNELS)
export const VALID_INVOKE_CHANNELS = Object.values(INVOKE_CHANNELS)

/**
 * 通道类型定义
 */
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS]
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS]
export type ReceiveChannel = typeof RECEIVE_CHANNELS[keyof typeof RECEIVE_CHANNELS]

/**
 * 检查通道是否有效
 */
export function isValidSendChannel(channel: string): channel is SendChannel {
  return VALID_SEND_CHANNELS.includes(channel as SendChannel)
}

export function isValidReceiveChannel(channel: string): channel is ReceiveChannel {
  return VALID_RECEIVE_CHANNELS.includes(channel as ReceiveChannel)
}

export function isValidInvokeChannel(channel: string): channel is InvokeChannel {
  return VALID_INVOKE_CHANNELS.includes(channel as InvokeChannel)
}