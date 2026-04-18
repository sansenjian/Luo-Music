/**
 * IPC 通道类型定义
 * 使用 TypeScript 模板类型自动生成通道映射，减少手动维护
 *
 * 使用方式：
 * 1. 在 channels.ts 中定义通道常量
 * 2. 使用 defineIpcChannel 定义单个通道的类型
 * 3. 使用 IpcChannelMap 自动生成完整的映射
 */

import type {
  INVOKE_CHANNELS,
  RECEIVE_CHANNELS,
  SEND_CHANNELS
} from '../shared/protocol/channels.ts'
import type { CacheClearOptions, CacheClearResult } from '../shared/protocol/cache.ts'
import type { LogEntry } from '../shared/log'
import type { AppConfig, ConfigChangeEvent } from '../shared/config'
import type {
  LocalLibraryAlbumSummary,
  LocalLibraryArtistSummary,
  LocalLibraryPage,
  LocalLibraryScanStatus,
  LocalLibraryState,
  LocalLibrarySummaryQuery,
  LocalLibraryTrack,
  LocalLibraryTrackQuery
} from '@/types/localLibrary'
import type { Song, SongPlatform } from '@/types/schemas.ts'
import type { LyricDisplayType, PlayMode as PlayerPlayMode } from '../../src/types/player'
import type { LyricLine as PlayerLyricLine } from '../../src/utils/player/core/lyric'

// 导出 PlayMode 类型供 handlers 使用
export type PlayMode = PlayerPlayMode

// ========== 基础类型 ==========

export type { CacheClearOptions, CacheClearResult }

export type ServiceStatus = 'running' | 'stopped' | 'error'

export interface ServiceStatusResponse {
  status: ServiceStatus
  port?: number
}

export type ApiRequestResult = {
  success: boolean
  data?: unknown
  error?: string
  cached?: boolean
}

export type LogMessage = LogEntry

export type ErrorReport = {
  code: string
  message: string
  stack?: string
  data?: unknown
}

export type DownloadRequest = {
  url: string
  filename: string
}

export type DownloadProgress = {
  progress: number
  filename: string
}

export type DownloadComplete = {
  filename: string
  path: string
}

export type DownloadFailed = {
  filename: string
  error: string
}

export type LyricData = {
  text: string
  trans: string
  roma: string
}

export type DesktopLyricUpdateCause =
  | 'interval'
  | 'lyric-change'
  | 'play-state'
  | 'seek'
  | 'lyrics-load'
  | 'reset'

export type LyricTimeUpdate = {
  time: number
  index: number
  text: string
  trans: string
  roma: string
  playing?: boolean
  songId?: string | number | null
  platform?: SongPlatform | null
  sequence?: number
  cause?: DesktopLyricUpdateCause
}

/**
 * IPC 播放器状态响应（简化版，用于跨进程通信） */
export interface PlayerStateResponse {
  isPlaying: boolean
  isLoading: boolean
  progress: number
  duration: number
  volume: number
  isMuted: boolean
  playMode: PlayMode
  playlist: Song[]
  currentIndex: number
  currentSong: Song | null
  currentLyricIndex: number
  showLyric: boolean
  showPlaylist: boolean
  isPlayerDocked: boolean
  lyricType: LyricDisplayType[]
}

export interface PlayerStateSnapshot extends PlayerStateResponse {
  lyricSong: Song | null
  lyrics: PlayerLyricLine[]
  desktopLyricSequence: number
}

export interface DesktopLyricSnapshot {
  currentSong: Song | null
  currentLyricIndex: number
  progress: number
  isPlaying: boolean
  lyrics: PlayerLyricLine[]
  songId: string | number | null
  platform: SongPlatform | null
  sequence: number
  lyricType: LyricDisplayType[]
}

export interface PlayerPlaySongPayload {
  song: Song
  playlist?: Song[]
}

export interface PlayerPlaySongByIdPayload {
  id: string | number
  platform?: SongPlatform
}

export type PlayerSongControlPayload =
  | 'prev'
  | 'next'
  | ({ type: 'play-song' } & PlayerPlaySongPayload)
  | ({ type: 'play-song-by-id' } & PlayerPlaySongByIdPayload)
  | { type: 'add-to-next'; song: Song }
  | { type: 'remove-from-playlist'; index: number }
  | { type: 'clear-playlist' }

// ========== 模板类型工具 ==========

/**
 * 定义单个 Invoke 通道的类型
 * @template T - 通道名称（来自 INVOKE_CHANNELS 常量）
 * @template P - 参数元组类型
 * @template R - 返回类型
 */
type DefineInvokeChannel<T extends string, P extends unknown[], R> = {
  [K in T]: { params: P; result: R }
}

/**
 * 定义单个 Send 通道的类型
 * @template T - 通道名称（来自 SEND_CHANNELS 常量）
 * @template P - 参数元组类型
 */
type DefineSendChannel<T extends string, P extends unknown[]> = { [K in T]: { params: P } }

/**
 * 定义单个 Receive 通道的类型
 * @template T - 通道名称（来自 RECEIVE_CHANNELS 常量）
 * @template P - payload 类型
 */
type DefineReceiveChannel<T extends string, P> = { [K in T]: { payload: P } }

/**
 * 合并多个通道类型
 */
type MergeChannels<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K]
}

// ========== Invoke 通道定义 ==========

type InvokeChannelsDefinition = MergeChannels<
  // 缓存管理
  DefineInvokeChannel<
    typeof INVOKE_CHANNELS.CACHE_GET_SIZE,
    [],
    { httpCache: number; httpCacheFormatted: string; note?: string }
  > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CACHE_CLEAR, [CacheClearOptions], CacheClearResult> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.CACHE_CLEAR_ALL,
      [keepUserData?: boolean],
      CacheClearResult
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CACHE_GET_PATHS, [], Record<string, string>> &
    // API 网关
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_REQUEST,
      [{ service: string; endpoint: string; params: Record<string, unknown>; noCache?: boolean }],
      ApiRequestResult
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.API_GET_SERVICES, [], string[]> &
    // 服务管理
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_GET_STATUS,
      [serviceId: string],
      ServiceStatusResponse
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_START,
      [serviceId: string],
      { success: boolean; error?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_STOP,
      [serviceId: string],
      { success: boolean; error?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_STATUS_ALL,
      [],
      Record<string, ServiceStatus>
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_RESTART,
      [serviceId: string],
      { success: boolean; error?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_HEALTH,
      [serviceId: string],
      { healthy: boolean; message?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.SERVICE_UPDATE_CONFIG,
      [serviceId: string, config: unknown],
      { success: boolean; error?: string }
    > &
    // 窗口控制
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.WINDOW_GET_SIZE,
      [],
      { width: number; height: number }
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.WINDOW_IS_MAXIMIZED, [], boolean> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.WINDOW_IS_MINIMIZED, [], boolean> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.WINDOW_GET_STATE,
      [],
      { isMaximized: boolean; isMinimized: boolean; isFullScreen: boolean; isAlwaysOnTop: boolean }
    > &
    // 配置管理
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CONFIG_GET, [key: string], unknown> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CONFIG_GET_ALL, [], AppConfig> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CONFIG_SET, [key: string, value: unknown], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CONFIG_DELETE, [key: string], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.CONFIG_RESET, [key?: string], void> &
    // 本地音乐
    DefineInvokeChannel<typeof INVOKE_CHANNELS.LOCAL_LIBRARY_GET_STATE, [], LocalLibraryState> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.LOCAL_LIBRARY_PICK_FOLDER, [], string | null> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_ADD_FOLDER,
      [folderPath: string],
      LocalLibraryState
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_REMOVE_FOLDER,
      [folderId: string],
      LocalLibraryState
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_SET_FOLDER_ENABLED,
      [folderId: string, enabled: boolean],
      LocalLibraryState
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.LOCAL_LIBRARY_SCAN, [], LocalLibraryState> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_GET_TRACKS,
      [query?: LocalLibraryTrackQuery],
      LocalLibraryPage<LocalLibraryTrack>
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ARTISTS,
      [query?: LocalLibrarySummaryQuery],
      LocalLibraryPage<LocalLibraryArtistSummary>
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_GET_ALBUMS,
      [query?: LocalLibrarySummaryQuery],
      LocalLibraryPage<LocalLibraryAlbumSummary>
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LOCAL_LIBRARY_GET_COVER,
      [coverHash: string],
      string | null
    > &
    // API 服务
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_SEARCH,
      [
        {
          keyword: string
          type?: string
          platform?: 'netease' | 'qq'
          page?: number
          limit?: number
        }
      ],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_SONG_URL,
      [{ id: string | number; platform?: 'netease' | 'qq'; quality?: number; mediaId?: string }],
      { url?: string; error?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_LYRIC,
      [{ id: string | number; platform?: 'netease' | 'qq' }],
      { lyric?: string; translated?: string; romalrc?: string; error?: string }
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_SONG_DETAIL,
      [{ id: string | number; platform?: 'netease' | 'qq' }],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_PLAYLIST_DETAIL,
      [{ id: string | number; platform?: 'netease' | 'qq' }],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_ARTIST_DETAIL,
      [{ id: string | number; platform?: 'netease' | 'qq' }],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_ALBUM_DETAIL,
      [{ id: string | number; platform?: 'netease' | 'qq' }],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_RECOMMENDED_PLAYLISTS,
      [{ platform?: 'netease' | 'qq'; limit?: number }],
      unknown
    > &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.API_GET_CHART,
      [{ platform?: 'netease' | 'qq'; id?: string }],
      unknown
    > &
    // 播放器控制
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_PLAY, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_PAUSE, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_TOGGLE, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_PLAY_SONG, [PlayerPlaySongPayload], void> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID,
      [PlayerPlaySongByIdPayload],
      void
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_SEEK_TO, [time: number], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_SET_VOLUME, [volume: number], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE, [PlayMode], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE, [], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_GET_STATE, [], PlayerStateResponse> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_GET_CURRENT_SONG, [], Song | null> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_GET_PLAYLIST, [], Song[]> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.PLAYER_GET_DESKTOP_LYRIC_SNAPSHOT,
      [],
      DesktopLyricSnapshot
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT, [Song], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST, [index: number], void> &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST, [], void> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.PLAYER_GET_LYRIC,
      [payload?: PlayerPlaySongByIdPayload],
      PlayerLyricLine[]
    > &
    // 歌词控制
    DefineInvokeChannel<typeof INVOKE_CHANNELS.LYRIC_TOGGLE, [], void> &
    DefineInvokeChannel<
      typeof INVOKE_CHANNELS.LYRIC_SET_ALWAYS_ON_TOP,
      [alwaysOnTop: boolean],
      void
    > &
    DefineInvokeChannel<typeof INVOKE_CHANNELS.LYRIC_LOCK, [locked: boolean], void>
>

export type InvokeChannelMap = InvokeChannelsDefinition

// ========== Send 通道定义 ==========

type SendChannelsDefinition = MergeChannels<
  // 窗口控制
  DefineSendChannel<typeof SEND_CHANNELS.WINDOW_MINIMIZE, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_MAXIMIZE, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_CLOSE, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_RESIZE, [{ width: number; height: number }]> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_MINIMIZE_TO_TRAY, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, [alwaysOnTop: boolean]> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_TOGGLE_FULLSCREEN, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_RESTORE, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_SHOW, []> &
    DefineSendChannel<typeof SEND_CHANNELS.WINDOW_HIDE, []> &
    // 播放器状态
    DefineSendChannel<typeof SEND_CHANNELS.MUSIC_PLAYING_CHECK, [playing: boolean]> &
    DefineSendChannel<typeof SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, [mode: number]> &
    DefineSendChannel<typeof SEND_CHANNELS.PLAYER_SYNC_STATE, [state: PlayerStateSnapshot]> &
    // 桌面歌词
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE, []> &
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_CONTROL, [action: string]> &
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE_LOCK, []> &
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_MOVE, [{ x: number; y: number }]> &
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_SET_IGNORE_MOUSE, [ignore: boolean]> &
    DefineSendChannel<typeof SEND_CHANNELS.DESKTOP_LYRIC_READY, []> &
    DefineSendChannel<typeof SEND_CHANNELS.LYRIC_TIME_UPDATE, [LyricTimeUpdate]> &
    // 下载
    DefineSendChannel<typeof SEND_CHANNELS.DOWNLOAD_MUSIC, [DownloadRequest]> &
    // 日志
    DefineSendChannel<typeof SEND_CHANNELS.LOG_MESSAGE, [LogMessage]> &
    // 错误报告
    DefineSendChannel<typeof SEND_CHANNELS.ERROR_REPORT, [ErrorReport]>
>

export type SendChannelMap = SendChannelsDefinition

// ========== Receive 通道定义 ==========

type ReceiveChannelsDefinition = MergeChannels<
  // 通用消息
  DefineReceiveChannel<typeof RECEIVE_CHANNELS.MAIN_PROCESS_MESSAGE, string> &
    // 缓存
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.CACHE_CLEARED, CacheClearResult> &
    // 播放器控制
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL,
      | 'play'
      | 'pause'
      | 'toggle'
      | 'toggle-mute'
      | { type: 'seek'; time: number }
      | { type: 'volume'; volume: number }
      | void
    > &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, PlayerSongControlPayload> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL, number> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_VOLUME_UP, void> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_VOLUME_DOWN, void> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_PROCESS_CONTROL, 'forward' | 'back'> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.MUSIC_PLAYER_DOCK_CONTROL, void> &
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.PLAYER_STATE_CHANGE,
      { isPlaying: boolean; currentTime: number }
    > &
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.PLAYER_TRACK_CHANGED,
      { song: Song | null; index: number }
    > &
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.PLAYER_LYRIC_UPDATE,
      { index: number; line: PlayerLyricLine | null }
    > &
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.PLAYER_PLAY_ERROR,
      { error: string; song: Song | null }
    > &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.CONFIG_CHANGED, ConfigChangeEvent> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.LOCAL_LIBRARY_UPDATED, LocalLibraryState> &
    DefineReceiveChannel<
      typeof RECEIVE_CHANNELS.LOCAL_LIBRARY_SCAN_STATUS,
      LocalLibraryScanStatus
    > &
    // 界面
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.HIDE_PLAYER, void> &
    // 歌词
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.LYRIC_UPDATE, LyricData> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.LYRIC_TIME_UPDATE, LyricTimeUpdate> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE, { locked: boolean }> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.PLAYER_DESKTOP_LYRIC_STATE, DesktopLyricSnapshot> &
    // 下载
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.DOWNLOAD_PROGRESS, DownloadProgress> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.DOWNLOAD_COMPLETE, DownloadComplete> &
    DefineReceiveChannel<typeof RECEIVE_CHANNELS.DOWNLOAD_FAILED, DownloadFailed>
>

export type ReceiveChannelMap = ReceiveChannelsDefinition

// ========== 辅助类型 ==========

export type InvokeChannel = keyof InvokeChannelMap
export type SendChannel = keyof SendChannelMap
export type ReceiveChannel = keyof ReceiveChannelMap

// 类型安全的 IPC 调用函数
export type InvokeFunction<T extends InvokeChannel> = (
  ...args: InvokeChannelMap[T]['params']
) => Promise<InvokeChannelMap[T]['result']>

export type SendFunction<T extends SendChannel> = (...args: SendChannelMap[T]['params']) => void

export type ReceiveCallback<T extends ReceiveChannel> = (
  payload: ReceiveChannelMap[T]['payload']
) => void

// ========== Protocol Contract Assertions ==========
// 编译时断言：确保通道映射的键与通道常量的值完全匹配

type Assert<T extends true> = T
type IsExactKeySet<Expected extends PropertyKey, Actual extends PropertyKey> = [
  Exclude<Expected, Actual>
] extends [never]
  ? [Exclude<Actual, Expected>] extends [never]
    ? true
    : false
  : false

type ProtocolSendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS]
type ProtocolInvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
type ProtocolReceiveChannel = (typeof RECEIVE_CHANNELS)[keyof typeof RECEIVE_CHANNELS]

// 如果这些断言失败，TypeScript 会报类型错误，提示通道映射不完整
type _AssertSendChannelMapKeys = Assert<IsExactKeySet<ProtocolSendChannel, keyof SendChannelMap>>
type _AssertInvokeChannelMapKeys = Assert<
  IsExactKeySet<ProtocolInvokeChannel, keyof InvokeChannelMap>
>
type _AssertReceiveChannelMapKeys = Assert<
  IsExactKeySet<ProtocolReceiveChannel, keyof ReceiveChannelMap>
>
