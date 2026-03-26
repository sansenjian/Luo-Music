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
  SERVICE_STATUS_ALL: 'service:status:all',
  SERVICE_RESTART: 'service:restart',
  SERVICE_HEALTH: 'service:health',
  SERVICE_UPDATE_CONFIG: 'service:update-config',

  // 窗口控制
  WINDOW_GET_SIZE: 'window:get-size',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_IS_MINIMIZED: 'window:is-minimized',
  WINDOW_GET_STATE: 'window:get-state',

  // 配置管理
  CONFIG_GET: 'config:get',
  CONFIG_GET_ALL: 'config:get-all',
  CONFIG_SET: 'config:set',
  CONFIG_DELETE: 'config:delete',
  CONFIG_RESET: 'config:reset',

  // API 服务
  API_SEARCH: 'api:search',
  API_GET_SONG_URL: 'api:get-song-url',
  API_GET_LYRIC: 'api:get-lyric',
  API_GET_SONG_DETAIL: 'api:get-song-detail',
  API_GET_PLAYLIST_DETAIL: 'api:get-playlist-detail',
  API_GET_ARTIST_DETAIL: 'api:get-artist-detail',
  API_GET_ALBUM_DETAIL: 'api:get-album-detail',
  API_GET_RECOMMENDED_PLAYLISTS: 'api:get-recommended-playlists',
  API_GET_CHART: 'api:get-chart',

  // 播放器控制
  PLAYER_PLAY: 'player:play',
  PLAYER_PAUSE: 'player:pause',
  PLAYER_TOGGLE: 'player:toggle',
  PLAYER_PLAY_SONG: 'player:play-song',
  PLAYER_PLAY_SONG_BY_ID: 'player:play-song-by-id',
  PLAYER_SKIP_TO_PREVIOUS: 'player:skip-to-previous',
  PLAYER_SKIP_TO_NEXT: 'player:skip-to-next',
  PLAYER_SEEK_TO: 'player:seek-to',
  PLAYER_SET_VOLUME: 'player:set-volume',
  PLAYER_TOGGLE_MUTE: 'player:toggle-mute',
  PLAYER_SET_PLAY_MODE: 'player:set-play-mode',
  PLAYER_TOGGLE_PLAY_MODE: 'player:toggle-play-mode',
  PLAYER_GET_STATE: 'player:get-state',
  PLAYER_GET_CURRENT_SONG: 'player:get-current-song',
  PLAYER_GET_PLAYLIST: 'player:get-playlist',
  PLAYER_GET_DESKTOP_LYRIC_SNAPSHOT: 'player:get-desktop-lyric-snapshot',
  PLAYER_ADD_TO_NEXT: 'player:add-to-next',
  PLAYER_REMOVE_FROM_PLAYLIST: 'player:remove-from-playlist',
  PLAYER_CLEAR_PLAYLIST: 'player:clear-playlist',
  PLAYER_GET_LYRIC: 'player:get-lyric',

  // 歌词控制
  LYRIC_TOGGLE: 'lyric:toggle',
  LYRIC_SET_ALWAYS_ON_TOP: 'lyric:set-always-on-top',
  LYRIC_LOCK: 'lyric:lock'
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
  WINDOW_MINIMIZE_TO_TRAY: 'minimize-to-tray',
  WINDOW_SET_ALWAYS_ON_TOP: 'set-always-on-top',
  WINDOW_TOGGLE_FULLSCREEN: 'toggle-fullscreen',
  WINDOW_RESTORE: 'restore-window',
  WINDOW_SHOW: 'show-window',
  WINDOW_HIDE: 'hide-window',

  // 桌面歌词
  DESKTOP_LYRIC_TOGGLE: 'toggle-desktop-lyric',
  DESKTOP_LYRIC_CONTROL: 'desktop-lyric-control',
  DESKTOP_LYRIC_TOGGLE_LOCK: 'toggle-desktop-lyric-lock',
  DESKTOP_LYRIC_MOVE: 'desktop-lyric-move',
  DESKTOP_LYRIC_SET_IGNORE_MOUSE: 'desktop-lyric-set-ignore-mouse',
  DESKTOP_LYRIC_READY: 'desktop-lyric-ready',
  LYRIC_TIME_UPDATE: 'lyric-time-update',

  // 下载
  DOWNLOAD_MUSIC: 'download-music',

  // 播放器状态
  MUSIC_PLAYING_CHECK: 'music-playing-check',
  MUSIC_PLAYMODE_TRAY_CHANGE: 'music-playmode-tray-change',
  PLAYER_SYNC_STATE: 'player:sync-state',

  // 日志
  LOG_MESSAGE: 'log-message',

  // 错误报告
  ERROR_REPORT: 'error-report'
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

  // 播放器状态变化
  PLAYER_STATE_CHANGE: 'player:state-change',
  PLAYER_TRACK_CHANGED: 'player:track-changed',
  PLAYER_LYRIC_UPDATE: 'player:lyric-update',
  PLAYER_PLAY_ERROR: 'player:play-error',

  // 配置变化
  CONFIG_CHANGED: 'config:changed',

  // 界面
  HIDE_PLAYER: 'hide-player',

  // 歌词
  LYRIC_UPDATE: 'lyric-update',
  LYRIC_TIME_UPDATE: 'lyric-time-update',
  DESKTOP_LYRIC_LOCK_STATE: 'desktop-lyric-lock-state',

  // 下载
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_FAILED: 'download-failed'
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
export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
export type SendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS]
export type ReceiveChannel = (typeof RECEIVE_CHANNELS)[keyof typeof RECEIVE_CHANNELS]

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
