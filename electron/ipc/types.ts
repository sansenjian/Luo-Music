/**
 * IPC 閫氶亾绫诲瀷瀹氫箟
 * 涓烘瘡涓€氶亾瀹氫箟鍙傛暟鍜岃繑鍥炵被鍨? */

import type {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  RECEIVE_CHANNELS
} from '../shared/protocol/channels.ts'
import type { CacheClearOptions, CacheClearResult } from '../shared/protocol/cache.ts'
import type { LogEntry } from '../shared/log'
import type { Song } from '../../src/types/schemas'
import type { PlayMode as PlayerPlayMode } from '../../src/types/player'

// 瀵煎嚭 PlayMode 绫诲瀷渚?handlers 浣跨敤
export type PlayMode = PlayerPlayMode

// ========== 鍩虹绫诲瀷 ==========

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

export type LyricTimeUpdate = {
  time: number
  index: number
  text: string
  trans: string
  roma: string
  playing?: boolean
}

/**
 * IPC 鎾斁鍣ㄧ姸鎬佸搷搴旓紙绠€鍖栫増锛岀敤浜庤法杩涚▼閫氫俊锛? */
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
  isCompact: boolean
}

// ========== Invoke 閫氶亾绫诲瀷 ==========

export interface InvokeChannelMap {
  // 缂撳瓨绠＄悊
  [INVOKE_CHANNELS.CACHE_GET_SIZE]: {
    params: []
    result: { httpCache: number; httpCacheFormatted: string; note?: string }
  }
  [INVOKE_CHANNELS.CACHE_CLEAR]: { params: [CacheClearOptions]; result: CacheClearResult }
  [INVOKE_CHANNELS.CACHE_CLEAR_ALL]: { params: [keepUserData?: boolean]; result: CacheClearResult }
  [INVOKE_CHANNELS.CACHE_GET_PATHS]: { params: []; result: Record<string, string> }

  // API 缃戝叧
  [INVOKE_CHANNELS.API_REQUEST]: {
    params: [
      { service: string; endpoint: string; params: Record<string, unknown>; noCache?: boolean }
    ]
    result: ApiRequestResult
  }
  [INVOKE_CHANNELS.API_GET_SERVICES]: { params: []; result: string[] }

  // 鏈嶅姟绠＄悊
  [INVOKE_CHANNELS.SERVICE_GET_STATUS]: {
    params: [serviceId: string]
    result: ServiceStatusResponse
  }
  [INVOKE_CHANNELS.SERVICE_START]: {
    params: [serviceId: string]
    result: { success: boolean; error?: string }
  }
  [INVOKE_CHANNELS.SERVICE_STOP]: {
    params: [serviceId: string]
    result: { success: boolean; error?: string }
  }
  [INVOKE_CHANNELS.SERVICE_STATUS_ALL]: { params: []; result: Record<string, ServiceStatus> }
  [INVOKE_CHANNELS.SERVICE_RESTART]: {
    params: [serviceId: string]
    result: { success: boolean; error?: string }
  }
  [INVOKE_CHANNELS.SERVICE_HEALTH]: {
    params: [serviceId: string]
    result: { healthy: boolean; message?: string }
  }
  [INVOKE_CHANNELS.SERVICE_UPDATE_CONFIG]: {
    params: [serviceId: string, config: unknown]
    result: { success: boolean; error?: string }
  }

  // 绐楀彛鎺у埗
  [INVOKE_CHANNELS.WINDOW_GET_SIZE]: { params: []; result: { width: number; height: number } }
  [INVOKE_CHANNELS.WINDOW_IS_MAXIMIZED]: { params: []; result: boolean }
  [INVOKE_CHANNELS.WINDOW_IS_MINIMIZED]: { params: []; result: boolean }
  [INVOKE_CHANNELS.WINDOW_GET_STATE]: { params: []; result: { isMaximized: boolean; isMinimized: boolean; isFullScreen: boolean } }

  // 閰嶇疆绠＄悊
  [INVOKE_CHANNELS.CONFIG_GET]: { params: [key: string]; result: unknown }
  [INVOKE_CHANNELS.CONFIG_GET_ALL]: { params: []; result: Record<string, unknown> }
  [INVOKE_CHANNELS.CONFIG_SET]: { params: [key: string, value: unknown]; result: void }
  [INVOKE_CHANNELS.CONFIG_DELETE]: { params: [key: string]; result: void }
  [INVOKE_CHANNELS.CONFIG_RESET]: { params: [key?: string]; result: void }

  // API 鏈嶅姟
  [INVOKE_CHANNELS.API_SEARCH]: {
    params: [keyword: string, type?: string];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_SONG_URL]: {
    params: [id: string | number];
    result: { url?: string; error?: string }
  }
  [INVOKE_CHANNELS.API_GET_LYRIC]: {
    params: [id: string | number];
    result: { lyric?: string; tlyric?: string; rlyric?: string; error?: string }
  }
  [INVOKE_CHANNELS.API_GET_SONG_DETAIL]: {
    params: [id: string | number];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_PLAYLIST_DETAIL]: {
    params: [id: string | number];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_ARTIST_DETAIL]: {
    params: [id: string | number];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_ALBUM_DETAIL]: {
    params: [id: string | number];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_RECOMMENDED_PLAYLISTS]: {
    params: [];
    result: unknown
  }
  [INVOKE_CHANNELS.API_GET_CHART]: {
    params: [chartId: string];
    result: unknown
  }

  // 鎾斁鍣ㄦ帶鍒?
  [INVOKE_CHANNELS.PLAYER_PLAY]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_PAUSE]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_TOGGLE]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_PLAY_SONG]: { params: [song: Song]; result: void }
  [INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID]: { params: [id: string | number]; result: void }
  [INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_SEEK_TO]: { params: [time: number]; result: void }
  [INVOKE_CHANNELS.PLAYER_SET_VOLUME]: { params: [volume: number]; result: void }
  [INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE]: { params: [mode: PlayMode]; result: void }
  [INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_GET_STATE]: { params: []; result: PlayerStateResponse }
  [INVOKE_CHANNELS.PLAYER_GET_CURRENT_SONG]: { params: []; result: Song | null }
  [INVOKE_CHANNELS.PLAYER_GET_PLAYLIST]: { params: []; result: Song[] }
  [INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT]: { params: [song: Song]; result: void }
  [INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST]: { params: [index: number]; result: void }
  [INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST]: { params: []; result: void }
  [INVOKE_CHANNELS.PLAYER_GET_LYRIC]: { params: []; result: unknown }

  // 姝岃瘝鎺у埗
  [INVOKE_CHANNELS.LYRIC_TOGGLE]: { params: []; result: void }
  [INVOKE_CHANNELS.LYRIC_SET_ALWAYS_ON_TOP]: { params: [alwaysOnTop: boolean]; result: void }
  [INVOKE_CHANNELS.LYRIC_LOCK]: { params: [locked: boolean]; result: void }
}

// ========== Send 閫氶亾绫诲瀷 ==========

export interface SendChannelMap {
  // 绐楀彛鎺у埗
  [SEND_CHANNELS.WINDOW_MINIMIZE]: { params: [] }
  [SEND_CHANNELS.WINDOW_MAXIMIZE]: { params: [] }
  [SEND_CHANNELS.WINDOW_CLOSE]: { params: [] }
  [SEND_CHANNELS.WINDOW_RESIZE]: { params: [{ width: number; height: number }] }
  [SEND_CHANNELS.WINDOW_MINIMIZE_TO_TRAY]: { params: [] }
  [SEND_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP]: { params: [alwaysOnTop: boolean] }
  [SEND_CHANNELS.WINDOW_TOGGLE_FULLSCREEN]: { params: [] }
  [SEND_CHANNELS.WINDOW_RESTORE]: { params: [] }
  [SEND_CHANNELS.WINDOW_SHOW]: { params: [] }
  [SEND_CHANNELS.WINDOW_HIDE]: { params: [] }

  // 鎾斁鍣ㄧ姸鎬?
  [SEND_CHANNELS.MUSIC_PLAYING_CHECK]: { params: [playing: boolean] }
  [SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE]: { params: [mode: number] }

  // 妗岄潰姝岃瘝
  [SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE]: { params: [] }
  [SEND_CHANNELS.DESKTOP_LYRIC_CONTROL]: { params: [action: string] }
  [SEND_CHANNELS.DESKTOP_LYRIC_TOGGLE_LOCK]: { params: [] }
  [SEND_CHANNELS.DESKTOP_LYRIC_MOVE]: { params: [{ x: number; y: number }] }
  [SEND_CHANNELS.DESKTOP_LYRIC_SET_IGNORE_MOUSE]: { params: [ignore: boolean] }
  [SEND_CHANNELS.LYRIC_TIME_UPDATE]: { params: [LyricTimeUpdate] }

  // 涓嬭浇
  [SEND_CHANNELS.DOWNLOAD_MUSIC]: { params: [DownloadRequest] }

  // 鏃ュ織
  [SEND_CHANNELS.LOG_MESSAGE]: { params: [LogMessage] }

  // 閿欒鎶ュ憡
  [SEND_CHANNELS.ERROR_REPORT]: { params: [ErrorReport] }
}

// ========== Receive 閫氶亾绫诲瀷 ==========

export interface ReceiveChannelMap {
  // 閫氱敤娑堟伅
  [RECEIVE_CHANNELS.MAIN_PROCESS_MESSAGE]: { payload: string }

  // 缂撳瓨
  [RECEIVE_CHANNELS.CACHE_CLEARED]: { payload: CacheClearResult }

  // 鎾斁鍣ㄦ帶鍒?
  [RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_SONG_CONTROL]: { payload: 'prev' | 'next' }
  [RECEIVE_CHANNELS.MUSIC_PLAYMODE_CONTROL]: { payload: number }
  [RECEIVE_CHANNELS.MUSIC_VOLUME_UP]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_VOLUME_DOWN]: { payload: void }
  [RECEIVE_CHANNELS.MUSIC_PROCESS_CONTROL]: { payload: 'forward' | 'back' }
  [RECEIVE_CHANNELS.MUSIC_COMPACT_MODE_CONTROL]: { payload: void }

  // 鐣岄潰
  [RECEIVE_CHANNELS.HIDE_PLAYER]: { payload: void }

  // 姝岃瘝
  [RECEIVE_CHANNELS.LYRIC_UPDATE]: { payload: LyricData }
  [RECEIVE_CHANNELS.LYRIC_TIME_UPDATE]: { payload: LyricTimeUpdate }
  [RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE]: { payload: { locked: boolean } }

  // 涓嬭浇
  [RECEIVE_CHANNELS.DOWNLOAD_PROGRESS]: { payload: DownloadProgress }
  [RECEIVE_CHANNELS.DOWNLOAD_COMPLETE]: { payload: DownloadComplete }
  [RECEIVE_CHANNELS.DOWNLOAD_FAILED]: { payload: DownloadFailed }
}

// ========== 杈呭姪绫诲瀷 ==========

export type InvokeChannel = keyof InvokeChannelMap
export type SendChannel = keyof SendChannelMap
export type ReceiveChannel = keyof ReceiveChannelMap

// 绫诲瀷瀹夊叏鐨?IPC 璋冪敤鍑芥暟
export type InvokeFunction<T extends InvokeChannel> = (
  ...args: InvokeChannelMap[T]['params']
) => Promise<InvokeChannelMap[T]['result']>

export type SendFunction<T extends SendChannel> = (...args: SendChannelMap[T]['params']) => void

export type ReceiveCallback<T extends ReceiveChannel> = (
  payload: ReceiveChannelMap[T]['payload']
) => void

