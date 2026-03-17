/**
 * 播放业务逻辑模块
 *
 * 负责处理播放相关的核心业务逻辑：
 * - 播放歌曲（含 URL 获取和歌词加载）
 * - 播放列表导航（上一首/下一首）
 * - 随机播放逻辑
 * - 错误处理和自动跳过
 *
 * 借鉴 VSCode 的命令模式：将业务逻辑封装为独立的动作处理器
 */

import type { Song } from '@/platform/music/interface'
import { getMusicAdapter } from '@/platform/music'
import { LyricParser } from '@/utils/player/core/lyric'
import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { errorCenter, Errors } from '@/utils/error'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import type { PlayerState } from './playerState'

/**
 * 播放动作处理器依赖接口
 */
export interface PlaybackActionsDeps {
  /** 获取播放器状态 */
  getState: () => PlayerState
  /** 状态变更回调 */
  onStateChange: (changes: Partial<PlayerState>) => void
  /** 播放歌曲（内部方法） */
  playSongByIndex: (index: number) => Promise<void>
  /** 设置歌词数组 */
  setLyricsArray: (lyrics: import('@/utils/player/core/lyric').LyricLine[]) => void
  /** 创建错误处理器 */
  createErrorHandler: () => import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
  /** 获取错误处理器（可能为 null） */
  getErrorHandler: () =>
    | import('@/utils/player/modules/playbackErrorHandler').PlaybackErrorHandler
    | null
  /** 平台检查 */
  platform: {
    isElectron: () => boolean
  }
}

/**
 * 播放动作处理器
 */
export class PlaybackActions {
  constructor(private readonly deps: PlaybackActionsDeps) {}

  /**
   * 统一的随机播放辅助函数
   */
  getRandomIndex(excludeCurrent = true): number {
    const state = this.deps.getState()
    if (state.songList.length === 0) return -1
    if (state.songList.length === 1) return 0

    let newIndex = Math.floor(Math.random() * state.songList.length)
    // 避免重复播放当前歌曲
    if (excludeCurrent && newIndex === state.currentIndex) {
      newIndex = (newIndex + 1) % state.songList.length
    }
    return newIndex
  }

  /**
   * 播放上一首
   */
  playPrev(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = state.currentIndex - 1
      if (newIndex < 0) {
        newIndex = state.songList.length - 1
      }
    }

    this.playSongWithDetails(newIndex).catch((err: unknown) => {
      console.error('播放上一首失败:', err)
    })
  }

  /**
   * 播放下一首
   */
  playNext(): void {
    const state = this.deps.getState()
    if (state.songList.length === 0) return

    let newIndex: number
    if (state.playMode === PLAY_MODE.SHUFFLE) {
      newIndex = this.getRandomIndex()
    } else {
      newIndex = state.currentIndex + 1
      if (newIndex >= state.songList.length) {
        if (state.playMode === PLAY_MODE.SEQUENTIAL) {
          return
        }
        newIndex = 0
      }
    }

    this.playSongWithDetails(newIndex).catch((err: unknown) => {
      console.error('播放下一首失败:', err)
    })
  }

  /**
   * 播放歌曲（简化版，用于内部调用）
   */
  async playSongByIndex(index: number): Promise<void> {
    const state = this.deps.getState()
    if (index < 0 || index >= state.songList.length) return

    const song = state.songList[index]
    if (!song.url) {
      console.error('No URL for song')
      throw new Error('No URL for song')
    }

    // 更新状态
    this.deps.onStateChange({
      currentIndex: index,
      currentSong: song
    })

    // 调用底层播放
    await this.deps.playSongByIndex(index)
  }

  /**
   * 播放歌曲（完整版，含 URL 获取和歌词加载）
   */
  async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
    const state = this.deps.getState()
    const song = state.songList[index]

    if (!song) {
      console.error('[Player] No song found at index:', index)
      return
    }

    // 设置加载中状态
    this.deps.onStateChange({ loading: true })

    // 获取平台适配器
    const platformKey = song.platform || (song as { server?: string }).server
    const adapter = getMusicAdapter(platformKey)

    console.log(`[Player] Playing song: ${song.name} (ID: ${song.id}, Platform: ${platformKey})`)

    try {
      // 1. 获取 URL（如果缺失）
      if (!song.url) {
        try {
          console.log('[Player] Fetching URL for song:', song.id)
          const mediaId = (song as Song & { mediaId?: string }).mediaId
          const url = await adapter.getSongUrl(song.id, { mediaId })
          console.log('[Player] Got URL:', url ? 'Success' : 'Failed')

          if (url) {
            song.url = url
          } else {
            console.warn('Song URL unavailable:', song.id)
            const err = Errors.noCopyright(song.id)
            errorCenter.emit(err)
            throw err
          }
        } catch (urlError: unknown) {
          console.error('Failed to get song URL:', urlError)
          if (urlError instanceof Error && urlError.name === 'AppError') throw urlError

          const err = Errors.noCopyright(song.id)
          errorCenter.emit(err)
          throw err
        }
      }

      // 2. 播放歌曲
      await this.playSongByIndex(index)

      // 3. 获取歌词
      try {
        const lyricData = await adapter.getLyric(song.id)
        const lrcText = lyricData.lrc || ''
        const tlyricText = lyricData.tlyric || ''
        const rlyricText = lyricData.romalrc || ''

        const lyrics = LyricParser.parse(lrcText, tlyricText, rlyricText)
        this.deps.setLyricsArray(lyrics)
      } catch (lyricError) {
        if (!isCanceledRequestError(lyricError)) {
          console.error('Failed to get lyrics:', lyricError)
        }
        this.deps.setLyricsArray([])
      }
    } catch (error: unknown) {
      console.error('Playback failed:', error)

      // 获取或创建错误处理器
      let errorHandler = this.deps.getErrorHandler()
      if (!errorHandler) {
        errorHandler = this.deps.createErrorHandler()
      }

      // 标记为不可用
      const message =
        error instanceof Error &&
        error.name === 'AppError' &&
        'getUserMessage' in error &&
        typeof error.getUserMessage === 'function'
          ? String(error.getUserMessage())
          : '该歌曲无法播放（可能需要 VIP 或受版权限制）'
      errorHandler.markAsUnavailable(song, message)

      // 如果 autoSkip 为 false，抛出错误让调用者处理
      if (!autoSkip) {
        throw error
      }

      // 自动跳过尝试播放下一首
      try {
        await this.playNextSkipUnavailable()
        return
      } catch {
        errorCenter.emit(Errors.fatal('无法播放任何歌曲，请检查网络或切换歌单'))
      }
    } finally {
      this.deps.onStateChange({ loading: false })
    }
  }

  /**
   * 播放下一首（跳过不可用歌曲）
   */
  async playNextSkipUnavailable(): Promise<void> {
    let errorHandler = this.deps.getErrorHandler()
    if (!errorHandler) {
      errorHandler = this.deps.createErrorHandler()
    }

    await errorHandler.playNextSkipUnavailable(async (index: number) => {
      await this.playSongWithDetails(index, false)
    })
  }
}

/**
 * 创建播放动作处理器
 */
export function createPlaybackActions(deps: PlaybackActionsDeps): PlaybackActions {
  return new PlaybackActions(deps)
}
