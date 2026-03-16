import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import platform from '../platform'
import { playerCore as audioManager } from '../utils/player/core/playerCore'
import { LyricEngine } from '../utils/player/core/lyric'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { PlaybackErrorHandler } from '../utils/player/modules/playbackErrorHandler'
import { PLAY_MODE } from '../utils/player/constants/playMode'
import {
  createInitialState,
  PLAY_MODE_TEXTS,
  type PlayerState as BasePlayerState
} from './player/playerState'
import { createAudioEventHandler, type AudioEventCallbacks } from './player/audioEvents'
import { createPlaybackActions, type PlaybackActions } from './player/playbackActions'
import { createIpcHandlers, type IpcHandlers } from './player/ipcHandlers'
import type { Song } from '../platform/music/interface'
import type { LyricLine } from '../utils/player/core/lyric'

// PlayerStore 状态类型（覆盖 errorHandler 类型）
interface PlayerState extends Omit<BasePlayerState, 'errorHandler'> {
  errorHandler: ReturnType<typeof markRaw<PlaybackErrorHandler>> | null
}

// PlayerStore 动作类型
export type PlayerStoreActions = {
  seek: (time: number) => void
  playNextSkipUnavailable: () => Promise<void>
  initAudio: () => void
  setupIpcListeners: () => void
  teardownIpcListeners: () => void
  notifyPlayingState: (playing?: boolean) => void
  notifyPlayModeChange: () => void
  handleAudioError: (error: unknown) => Promise<void>
  createErrorHandler: () => ReturnType<typeof markRaw<PlaybackErrorHandler>>
  updateLyricIndex: () => void
  setSongList: (songs: Song[]) => void
  addSong: (song: Song) => void
  playSongByIndex: (index: number) => Promise<void>
  playSongWithDetails: (index: number, autoSkip?: boolean) => Promise<void>
  togglePlay: () => void
  getRandomIndex: (excludeCurrent?: boolean) => number
  playPrev: () => void
  playNext: () => void
  handleSongEnd: () => void
  resetErrorHandler: () => void
  setVolume: (vol: number) => void
  togglePlayMode: () => void
  setPlayMode: (mode: number) => void
  setLyric: (lyric: unknown) => void
  toggleCompactMode: () => void
  setLyricsArray: (lyrics: LyricLine[]) => void
  clearPlaylist: () => void
}

// 模块实例
let audioEventHandler: ReturnType<typeof createAudioEventHandler> | null = null
let playbackActions: PlaybackActions | null = null
let ipcHandlers: IpcHandlers | null = null

// 歌词行获取函数（由外部设置）
let getLyricLineFn: (() => { text: string; trans: string; roma: string } | null) | null = null

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => ({
    ...createInitialState(),
    errorHandler: null
  }),

  getters: {
    hasSongs: state => state.songList.length > 0,

    currentSongInfo: (state): Song | null => {
      if (state.currentIndex >= 0 && state.currentIndex < state.songList.length) {
        return state.songList[state.currentIndex]
      }
      return null
    },

    formattedProgress: state => formatTime(state.progress),
    formattedDuration: state => formatTime(state.duration),

    playModeText: state => PLAY_MODE_TEXTS[state.playMode]
  },

  actions: {
    seek(time: number): void {
      audioManager.seek(time)
      this.progress = time
    },

    async playNextSkipUnavailable(): Promise<void> {
      if (!this.errorHandler) {
        this.errorHandler = this.createErrorHandler()
      }
      await this.errorHandler.playNextSkipUnavailable(async (index: number) => {
        await this.playSongWithDetails(index, false)
      })
    },

    initAudio() {
      if (this.initialized) return

      this.initialized = true
      this.lyricEngine = new LyricEngine()

      audioManager.setVolume(this.volume)

      // 更新歌词行获取函数
      getLyricLineFn = () => {
        const line = this.lyricsArray[this.currentLyricIndex]
        return line ? { text: line.text, trans: line.trans || '', roma: line.roma || '' } : null
      }

      // 定义事件回调
      const callbacks: AudioEventCallbacks = {
        onTimeUpdate: (time: number) => {
          this.progress = time
          this.updateLyricIndex()
        },
        onLoadedMetadata: (duration: number) => {
          this.duration = duration
        },
        onEnded: () => {
          this.handleSongEnd()
        },
        onPlay: () => {
          this.playing = true
          this.notifyPlayingState(true)
        },
        onPause: () => {
          this.playing = false
          this.notifyPlayingState(false)
        },
        onError: (error: unknown) => {
          console.error('Audio error:', error)
          this.handleAudioError(error)
        }
      }

      // 创建事件处理器（如果还不存在）
      if (!audioEventHandler) {
        audioEventHandler = createAudioEventHandler(
          this.$state as unknown as PlayerState,
          callbacks,
          {
            isElectron: () => platform.isElectron(),
            send: (channel, data) => platform.send(channel, data)
          }
        )
      } else {
        // 如果已存在，更新回调和状态引用
        audioEventHandler.setCallbacks(callbacks)
      }

      // 初始化事件监听
      audioEventHandler.init({
        uiUpdateInterval: 250,
        ipcBroadcastInterval: 500,
        getCurrentLyricLine: () => getLyricLineFn?.() ?? null
      })

      this.setupIpcListeners()
    },

    setupIpcListeners(): void {
      // 使用新的 IPC 处理器模块
      if (!ipcHandlers) {
        ipcHandlers = createIpcHandlers({
          getState: () => this.$state as unknown as PlayerState,
          onStateChange: changes => {
            Object.assign(this, changes)
          },
          togglePlay: () => this.togglePlay(),
          play: () => {
            if (!this.initialized) {
              if (this.songList.length > 0) {
                const targetIndex = this.currentIndex >= 0 ? this.currentIndex : 0
                void this.playSongWithDetails(targetIndex)
              }
              return
            }

            if (!this.playing) {
              void audioManager.play().catch(error => {
                if (!(error instanceof Error) || error.name !== 'AbortError') {
                  console.error('Failed to resume playback:', error)
                }
              })
            }
          },
          pause: () => {
            if (this.initialized && this.playing) {
              audioManager.pause()
            }
          },
          playPrev: () => this.playPrev(),
          playNext: () => this.playNext(),
          setPlayMode: mode => this.setPlayMode(mode),
          setVolume: vol => this.setVolume(vol),
          toggleCompactMode: () => this.toggleCompactMode(),
          platform: {
            isElectron: () => platform.isElectron(),
            on: (channel, callback) => platform.on(channel, callback)
          }
        })
      }
      ipcHandlers.setup()
      this.ipcInitialized = true
    },

    teardownIpcListeners(): void {
      if (ipcHandlers) {
        ipcHandlers.teardown()
      }
      this.ipcUnsubscribers = []
      this.ipcInitialized = false
    },

    notifyPlayingState(playing?: boolean) {
      platform.sendPlayingState(playing ?? this.playing)
    },

    notifyPlayModeChange() {
      platform.sendPlayModeChange(this.playMode)
    },

    async handleAudioError(error: unknown) {
      if (!this.errorHandler) {
        this.errorHandler = this.createErrorHandler()
      }

      const result = await this.errorHandler.handleAudioError(error, this.currentSong)

      if (result.shouldRetry && result.url) {
        if (this.currentSong) {
          this.currentSong.url = result.url
        }
        await audioManager.play(result.url)
        this.playing = true
      } else if (result.shouldSkip) {
        this.playNext()
      }
    },

    createErrorHandler() {
      return markRaw(
        new PlaybackErrorHandler({
          getState: () => ({
            songList: this.songList,
            currentIndex: this.currentIndex,
            playMode: this.playMode
          }),
          onStateChange: changes => {
            if (changes.playing !== undefined) this.playing = changes.playing
          }
        })
      )
    },

    updateLyricIndex(): void {
      if (!this.lyricEngine) return

      const index = this.lyricEngine.update(this.progress)

      if (this.currentLyricIndex !== index) {
        this.currentLyricIndex = index
      }
    },

    setSongList(songs: Song[]) {
      this.songList = songs

      if (this.currentSong) {
        const newIndex = songs.findIndex(s => s.id === this.currentSong!.id)
        this.currentIndex = newIndex
      } else {
        this.currentIndex = -1
      }

      this.resetErrorHandler()
    },

    addSong(song: Song): void {
      this.songList.push(song)
    },

    async playSongByIndex(index: number): Promise<void> {
      if (index < 0 || index >= this.songList.length) return

      this.initAudio()

      this.currentIndex = index
      this.currentSong = this.songList[index]

      if (!this.currentSong.url) {
        console.error('No URL for song')
        throw new Error('No URL for song')
      }

      try {
        await audioManager.play(String(this.currentSong.url))
        this.playing = true
      } catch (error) {
        console.error('播放失败:', error)
        this.playing = false
        throw error
      }
    },

    async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
      // 使用新的播放动作处理器模块
      if (!playbackActions) {
        playbackActions = createPlaybackActions({
          getState: () => this.$state as unknown as PlayerState,
          onStateChange: changes => {
            Object.assign(this, changes)
          },
          playSongByIndex: index => this.playSongByIndex(index),
          setLyricsArray: lyrics => this.setLyricsArray(lyrics),
          createErrorHandler: () => this.createErrorHandler(),
          getErrorHandler: () => this.errorHandler,
          platform: {
            isElectron: () => platform.isElectron()
          }
        })
      }
      await playbackActions.playSongWithDetails(index, autoSkip)
    },

    togglePlay(): void {
      if (!this.initialized) {
        if (this.songList.length > 0) {
          this.playSongWithDetails(0)
        }
        return
      }

      audioManager.toggle()
    },

    getRandomIndex(excludeCurrent = true): number {
      if (this.songList.length === 0) return -1
      if (this.songList.length === 1) return 0

      let newIndex = Math.floor(Math.random() * this.songList.length)
      // 避免重复播放当前歌曲
      if (excludeCurrent && newIndex === this.currentIndex) {
        newIndex = (newIndex + 1) % this.songList.length
      }
      return newIndex
    },

    playPrev(): void {
      if (this.songList.length === 0) return

      let newIndex
      if (this.playMode === PLAY_MODE.SHUFFLE) {
        newIndex = this.getRandomIndex()
      } else {
        newIndex = this.currentIndex - 1
        if (newIndex < 0) {
          newIndex = this.songList.length - 1
        }
      }

      this.playSongWithDetails(newIndex).catch((err: unknown) => {
        console.error('播放上一首失败:', err)
      })
    },

    playNext(): void {
      if (this.songList.length === 0) return

      let newIndex
      if (this.playMode === PLAY_MODE.SHUFFLE) {
        newIndex = this.getRandomIndex()
      } else {
        newIndex = this.currentIndex + 1
        if (newIndex >= this.songList.length) {
          if (this.playMode === PLAY_MODE.SEQUENTIAL) {
            return
          }
          newIndex = 0
        }
      }

      this.playSongWithDetails(newIndex).catch((err: unknown) => {
        console.error('播放下一首失败:', err)
      })
    },

    handleSongEnd(): void {
      if (this.playMode === PLAY_MODE.SINGLE_LOOP) {
        audioManager.seek(0)
        audioManager.play()
      } else {
        this.playNext()
      }
    },

    resetErrorHandler() {
      if (this.errorHandler) {
        this.errorHandler.reset()
      }
    },

    setVolume(vol: number) {
      this.volume = Math.max(0, Math.min(1, vol))
      audioManager.setVolume(this.volume)
    },

    togglePlayMode() {
      this.playMode = (this.playMode + 1) % 4
      this.notifyPlayModeChange()
    },

    setPlayMode(mode: number) {
      if (mode >= 0 && mode <= 3) {
        this.playMode = mode
        this.notifyPlayModeChange()
      }
    },

    setLyric(lyric: unknown) {
      this.lyric = lyric
    },

    toggleCompactMode(): void {
      this.isCompact = !this.isCompact
      // 标记用户已显式设置过紧凑模式偏好
      localStorage.setItem('compactModeUserToggled', 'true')
    },

    setLyricsArray(lyrics: LyricLine[]) {
      this.lyricsArray = markRaw(lyrics) as LyricLine[]
      this.currentLyricIndex = -1
      if (this.lyricEngine) {
        this.lyricEngine.setLyrics(lyrics)
      }
    },

    clearPlaylist(): void {
      this.songList = []
      this.currentIndex = -1
      this.currentSong = null
      audioManager.pause()
      this.playing = false
      this.progress = 0
      this.duration = 0
      this.resetErrorHandler()
      this.teardownIpcListeners()

      // 清理事件处理器
      if (audioEventHandler) {
        audioEventHandler.dispose()
        audioEventHandler = null
      }

      // 清理播放动作处理器
      playbackActions = null

      this.initialized = false
    }
  },

  persist: {
    storage: localStorage,
    pick: ['volume', 'playMode', 'lyricType', 'isCompact'],
    // Note: songList and currentIndex are excluded to avoid stale URL issues
    // Songs will be re-fetched when needed
    beforeHydrate: (_context: unknown) => {
      // 数据恢复前验证
      console.log('Restoring player state...')
    },
    afterHydrate: (context: unknown) => {
      const store = (context as { store: PlayerState }).store
      // 验证音量范围
      if (store.volume < 0 || store.volume > 1) {
        store.volume = 0.7
      }
      // 设置音量到 audioManager
      if (store.initialized) {
        audioManager.setVolume(store.volume)
      }
      // 验证播放模式
      if (store.playMode < 0 || store.playMode > 3) {
        store.playMode = 0
      }
      // 验证歌词类型
      if (!Array.isArray(store.lyricType) || store.lyricType.length === 0) {
        store.lyricType = ['original', 'trans']
      }
    }
  }
})
