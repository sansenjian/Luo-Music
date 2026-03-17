/**
 * 播放器服务代理 - 渲染进程的播放器控制层
 *
 * 功能：
 * 1. 播放控制（播放、暂停、切歌）
 * 2. 播放列表管理
 * 3. 歌词获取
 * 4. 播放状态监听
 */

// 导入服务代理
import { getIpcProxy } from './ipcProxy'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from '../../shared/protocol/channels'

/**
 * 播放模式
 */
export type PlayMode = 'list' | 'loop' | 'random' | 'single'

/**
 * 歌曲信息
 */
export interface Song {
  id: string
  name: string
  artist: string
  album: string
  cover: string
  url?: string
  duration?: number
  platform?: 'netease' | 'qq'
}

/**
 * 播放状态
 */
export interface PlayerState {
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playMode: PlayMode
  playlist: Song[]
  currentIndex: number
  currentSong: Song | null
}

/**
 * 歌词行
 */
export interface LyricLine {
  time: number
  text: string
  translated?: string
}

/**
 * 播放器服务代理类
 *
 * 用法：
 * ```typescript
 * const playerProxy = new PlayerProxy()
 *
 * // 播放控制
 * await playerProxy.play()
 * await playerProxy.pause()
 * await playerProxy.toggle()
 * await playerProxy.skipToNext()
 *
 * // 播放歌曲
 * await playerProxy.playSong(song)
 *
 * // 获取状态
 * const state = await playerProxy.getState()
 *
 * // 监听变化
 * playerProxy.onPlayStateChange((data) => {
 *   console.log('Play state changed:', data)
 * })
 * ```
 */
export class PlayerProxy {
  private readonly ipcProxy: ReturnType<typeof getIpcProxy>

  constructor() {
    this.ipcProxy = getIpcProxy()
  }

  /**
   * 播放
   */
  async play(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY)
  }

  /**
   * 暂停
   */
  async pause(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PAUSE)
  }

  /**
   * 切换播放/暂停
   */
  async toggle(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE)
  }

  /**
   * 播放指定歌曲
   *
   * @param song - 歌曲信息
   * @param playlist - 可选的播放列表
   */
  async playSong(song: Song, playlist?: Song[]): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG, { song, playlist })
  }

  /**
   * 播放歌曲（通过 ID）
   *
   * @param id - 歌曲 ID
   * @param platform - 音乐平台
   */
  async playSongById(id: string, platform: 'netease' | 'qq' = 'netease'): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_PLAY_SONG_BY_ID, { id, platform })
  }

  /**
   * 上一首
   */
  async skipToPrevious(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_PREVIOUS)
  }

  /**
   * 下一首
   */
  async skipToNext(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SKIP_TO_NEXT)
  }

  /**
   * 跳转到指定时间
   *
   * @param time - 时间（秒）
   */
  async seekTo(time: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SEEK_TO, time)
  }

  /**
   * 设置音量
   *
   * @param volume - 音量（0-100）
   */
  async setVolume(volume: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SET_VOLUME, volume)
  }

  /**
   * 切换静音
   */
  async toggleMute(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE_MUTE)
  }

  /**
   * 设置播放模式
   *
   * @param mode - 播放模式
   */
  async setPlayMode(mode: PlayMode): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_SET_PLAY_MODE, mode)
  }

  /**
   * 切换播放模式
   */
  async togglePlayMode(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_TOGGLE_PLAY_MODE)
  }

  /**
   * 获取播放状态
   */
  async getState(): Promise<PlayerState> {
    return this.ipcProxy.invoke<PlayerState>(INVOKE_CHANNELS.PLAYER_GET_STATE)
  }

  /**
   * 获取当前播放歌曲
   */
  async getCurrentSong(): Promise<Song | null> {
    const state = await this.getState()
    return state.currentSong
  }

  /**
   * 获取播放列表
   */
  async getPlaylist(): Promise<Song[]> {
    const state = await this.getState()
    return state.playlist
  }

  /**
   * 添加到播放列表下一首
   *
   * @param song - 歌曲信息
   */
  async addToNext(song: Song): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_ADD_TO_NEXT, song)
  }

  /**
   * 从播放列表移除
   *
   * @param index - 索引
   */
  async removeFromPlaylist(index: number): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_REMOVE_FROM_PLAYLIST, index)
  }

  /**
   * 清空播放列表
   */
  async clearPlaylist(): Promise<void> {
    await this.ipcProxy.invoke(INVOKE_CHANNELS.PLAYER_CLEAR_PLAYLIST)
  }

  /**
   * 获取歌词
   *
   * @param songId - 歌曲 ID
   * @param platform - 音乐平台
   * @returns 歌词行数组
   */
  async getLyric(songId: string, platform: 'netease' | 'qq' = 'netease'): Promise<LyricLine[]> {
    return this.ipcProxy.invoke<LyricLine[]>(INVOKE_CHANNELS.PLAYER_GET_LYRIC, { songId, platform })
  }

  /**
   * 监听播放状态变化
   *
   * @param listener - 回调函数
   * @returns 取消监听函数
   */
  onPlayStateChange(
    listener: (data: { isPlaying: boolean; currentTime: number }) => void
  ): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_STATE_CHANGE, listener)
  }

  /**
   * 监听歌曲变化
   *
   * @param listener - 回调函数
   * @returns 取消监听函数
   */
  onSongChange(listener: (data: { song: Song | null; index: number }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_TRACK_CHANGED, listener)
  }

  /**
   * 监听歌词更新
   *
   * @param listener - 回调函数
   * @returns 取消监听函数
   */
  onLyricUpdate(listener: (data: { index: number; line: LyricLine }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_LYRIC_UPDATE, listener)
  }

  /**
   * 监听播放错误
   *
   * @param listener - 回调函数
   * @returns 取消监听函数
   */
  onPlayError(listener: (data: { error: string; song: Song }) => void): () => void {
    return this.ipcProxy.on(RECEIVE_CHANNELS.PLAYER_PLAY_ERROR, listener)
  }
}

/**
 * 全局播放器代理实例
 */
let globalPlayerProxy: PlayerProxy | null = null

/**
 * 获取全局播放器代理
 */
export function getPlayerProxy(): PlayerProxy {
  if (!globalPlayerProxy) {
    globalPlayerProxy = new PlayerProxy()
  }
  return globalPlayerProxy
}
