/**
 * 播放器相关类型定义
 *
 * 用于 Electron IPC handlers 的类型安全通信
 * 统一导出播放器状态、歌曲、播放模式等核心类型
 */

import type { PlayMode as PlayModeType } from '../utils/player/constants/playMode'
import type { Song } from './schemas'

// 重新导出歌曲相关类型
export type { Song, Artist, Album } from './schemas'

// 导出播放模式常量和类型
export { PLAY_MODE, PLAY_MODE_LABELS, PLAY_MODE_ICONS } from '../utils/player/constants/playMode'
export type { PlayMode } from '../utils/player/constants/playMode'

/**
 * IPC 播放器状态响应（简化版，用于跨进程通信）
 * 不包含复杂对象如 errorHandler、lyricEngine 等
 */
export interface PlayerStateResponse {
  isPlaying: boolean
  isLoading: boolean
  progress: number
  duration: number
  volume: number
  isMuted: boolean
  playMode: PlayModeType
  playlist: Song[]
  currentIndex: number
  currentSong: Song | null
  currentLyricIndex: number
  showLyric: boolean
  showPlaylist: boolean
  isCompact: boolean
}

/**
 * 播放控制命令类型
 */
export type PlayCommand = 'play' | 'pause' | 'toggle'

/**
 * 歌曲控制命令类型
 */
export type SongCommand = 'prev' | 'next'

/**
 * 播放模式控制命令
 */
export type PlayModeCommand = 'toggle' | PlayModeType

/**
 * Seek 命令数据结构
 */
export interface SeekCommand {
  type: 'seek'
  time: number
}

/**
 * 音量控制命令数据结构
 */
export interface VolumeCommand {
  type: 'volume'
  volume: number
}

/**
 * 播放器控制命令的联合类型
 */
export type PlayerControlCommand =
  | PlayCommand
  | SongCommand
  | 'toggle-mute'
  | SeekCommand
  | VolumeCommand

/**
 * 播放模式控制命令的联合类型
 */
export type PlayModeControlCommand = PlayModeCommand
