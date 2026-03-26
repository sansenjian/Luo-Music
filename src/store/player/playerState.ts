/**
 * 播放器状态定义
 *
 * 纯粹的接口和类型定义，不包含任何业务逻辑
 * 借鉴 VSCode 的状态管理模式：状态与行为分离
 */

import type { LyricLine } from '@/utils/player/core/lyric'
import type { Song } from '@/types/schemas'
import { PLAY_MODE, type PlayMode } from '@/utils/player/constants/playMode'

/**
 * 播放器状态接口
 */
export interface PlayerState {
  /** 是否正在播放 */
  playing: boolean
  /** 当前播放进度 (秒) */
  progress: number
  /** 歌曲总时长 (秒) */
  duration: number
  /** 音量 (0-1) */
  volume: number
  /** 播放模式 */
  playMode: PlayMode
  /** 播放列表 */
  songList: Song[]
  /** 当前歌曲索引 */
  currentIndex: number
  /** 当前歌曲 */
  currentSong: Song | null
  /** 当前歌词所属歌曲 */
  lyricSong: Song | null
  /** 歌词原始数据 */
  lyric: unknown
  /** 歌词解析后的数组 */
  lyricsArray: LyricLine[]
  /** 当前歌词索引 */
  currentLyricIndex: number
  /** 歌词大小 (原文) */
  lyricSize: number
  /** 歌词大小 (翻译) */
  tlyricSize: number
  /** 歌词大小 (罗马音) */
  rlyricSize: number
  /** 歌词类型 */
  lyricType: string[]
  /** 是否显示歌词 */
  showLyric: boolean
  /** 是否显示播放列表 */
  showPlaylist: boolean
  /** 是否已初始化 */
  initialized: boolean
  /** 是否加载中 */
  loading: boolean
  /** 是否紧凑模式 */
  isCompact: boolean
  /** IPC 是否已初始化 */
  ipcInitialized: boolean
}

/**
 * 播放器状态变更接口
 */
export interface PlayerStateChanges {
  playing?: boolean
  progress?: number
  duration?: number
  volume?: number
  playMode?: PlayMode
  currentIndex?: number
  currentSong?: Song | null
  currentLyricIndex?: number
  loading?: boolean
}

/**
 * 创建初始播放器状态
 */
export function createInitialState(): PlayerState {
  return {
    playing: false,
    progress: 0,
    duration: 0,
    volume: 0.7,
    playMode: PLAY_MODE.SEQUENTIAL,
    songList: [],
    currentIndex: -1,
    currentSong: null,
    lyricSong: null,
    lyric: null,
    lyricsArray: [],
    currentLyricIndex: -1,
    lyricSize: 20,
    tlyricSize: 14,
    rlyricSize: 12,
    lyricType: ['original', 'trans'],
    showLyric: true,
    showPlaylist: false,
    initialized: false,
    loading: false,
    isCompact: false,
    ipcInitialized: false
  }
}

/**
 * 播放模式文本映射
 */
export const PLAY_MODE_TEXTS = ['顺序播放', '列表循环', '单曲循环', '随机播放'] as const
