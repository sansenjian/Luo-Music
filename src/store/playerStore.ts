import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import platform from '../platform'
import { getMusicAdapter } from '../platform/music'
import { playerCore as audioManager } from '../utils/player/core/playerCore'
import { LyricParser, LyricEngine, type LyricLine } from '../utils/player/core/lyric'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { PlaybackErrorHandler } from '../utils/player/modules/playbackErrorHandler'
import type { ErrorHandler } from '../utils/player/modules/playbackErrorHandler'
import { PLAY_MODE } from '../utils/player/constants/playMode'
import { errorCenter, Errors } from '../utils/error'
import type { Song } from '../platform/music/interface'

interface PlayerState {
  playing: boolean
  progress: number
  duration: number
  volume: number
  playMode: number
  songList: Song[]
  currentIndex: number
  currentSong: Song | null
  lyric: any
  lyricsArray: LyricLine[]
  currentLyricIndex: number
  lyricSize: number
  tlyricSize: number
  rlyricSize: number
  lyricType: string[]
  showLyric: boolean
  showPlaylist: boolean
  initialized: boolean
  loading: boolean
  isCompact: boolean
  errorHandler: ErrorHandler | null
  lyricEngine: LyricEngine | null
  ipcInitialized: boolean
}

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => ({
    playing: false,
    progress: 0,
    duration: 0,
    volume: 0.7,
    playMode: 0,
    songList: [],
    currentIndex: -1,
    currentSong: null,
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
    errorHandler: null,
    lyricEngine: null,
    ipcInitialized: false
  }),
  
  getters: {
    hasSongs: (state) => state.songList.length > 0,
    
    currentSongInfo: (state): Song | null => {
      if (state.currentIndex >= 0 && state.currentIndex < state.songList.length) {
        return state.songList[state.currentIndex]
      }
      return null
    },
    
    formattedProgress: (state) => formatTime(state.progress),
    formattedDuration: (state) => formatTime(state.duration),
    
    playModeText: (state) => {
      const modes = ['顺序播放', '列表循环', '单曲循环', '随机播放']
      return modes[state.playMode]
    },
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
      this.lyricEngine = markRaw(new LyricEngine()) // Initialize lyric engine

      audioManager.setVolume(this.volume)
      
      // ...先清理旧事件，防止 HMR 或热重置时事件累积
      audioManager.off('timeupdate')
      audioManager.off('loadedmetadata')
      audioManager.off('ended')
      audioManager.off('play')
      audioManager.off('pause')
      audioManager.off('error')
      
      // 节流处理 timeupdate，每 100ms 更新一次 (本地 UI)
      let lastUpdate = 0
      // IPC 广播节流，每 200ms 一次
      let lastBroadcast = 0
      
      audioManager.on('timeupdate', () => {
        const now = Date.now()
        
        // 本地更新 (100ms) - 降低频率以优化性能
        if (now - lastUpdate >= 250) { // 从 100ms 改为 250ms，约 4fps，足够用于进度条
          lastUpdate = now
          // audioManager.currentTime 是一个属性，不是方法，也不是 Number 构造函数
          // 如果它返回 Number 对象而不是 primitive number，可能会导致此错误
          // 但通常 HTMLMediaElement.currentTime 返回的是 number
          // 这里显式转换一下以防万一
          this.progress = Number(audioManager.currentTime) || 0
          
          this.updateLyricIndex() // Sync lyric
        }

        // Sync lyric to desktop lyric window if running in Electron (500ms)
        if (now - lastBroadcast >= 500) { // 从 200ms 改为 500ms
          if (platform.isElectron()) {
            lastBroadcast = now
            const currentLyricLine = this.lyricsArray[this.currentLyricIndex]
            platform.send('lyric-time-update', {
              time: this.progress,
              index: this.currentLyricIndex,
              text: currentLyricLine?.text || '',
              trans: currentLyricLine?.trans || '',
              romalrc: currentLyricLine?.roma || '' // Note: LyricLine uses 'roma' not 'romalrc'
            })
          }
        }
      })
      
      audioManager.on('loadedmetadata', () => {
        this.duration = audioManager.duration
      })
      
      audioManager.on('ended', () => {
        this.handleSongEnd()
      })
      
      audioManager.on('play', () => {
        this.playing = true
      })
      
      audioManager.on('pause', () => {
        this.playing = false
      })
      
      audioManager.on('error', (e: any) => {
        console.error('Audio error:', e)
        this.handleAudioError(e)
      })
      
      this.setupIpcListeners()
    },
    
    setupIpcListeners() {
      // Prevent duplicate listeners
      if (this.ipcInitialized) return
      
      // Platform check is safer, though platform.on handles non-electron gracefully
      if (!platform.isElectron()) return
      
      this.ipcInitialized = true
      type Unsubscriber = () => void
      const unsubscribers: Unsubscriber[] = []
      
      unsubscribers.push(
        platform.on('music-playing-control', () => {
          this.togglePlay()
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-song-control', (direction: string) => {
          if (direction === 'prev') {
            this.playPrev()
          } else if (direction === 'next') {
            this.playNext()
          }
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-playmode-control', (mode: number) => {
          this.setPlayMode(mode)
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-volume-up', () => {
          this.setVolume(Math.min(1, this.volume + 0.1))
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-volume-down', () => {
          this.setVolume(Math.max(0, this.volume - 0.1))
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-process-control', (direction: string) => {
          const step = 5
          if (direction === 'back') {
            this.seek(Math.max(0, this.progress - step))
          } else if (direction === 'forward') {
            this.seek(Math.min(this.duration, this.progress + step))
          }
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('music-compact-mode-control', () => {
          this.toggleCompactMode()
        }) as Unsubscriber
      )
      
      unsubscribers.push(
        platform.on('hide-player', () => {
          this.isCompact = !this.isCompact
        }) as Unsubscriber
      )
      
      // Store unsubscribers if needed for cleanup
      // this._ipcUnsubscribers = unsubscribers
    },
    
    notifyPlayingState() {
      platform.sendPlayingState(this.playing)
    },
    
    notifyPlayModeChange() {
      platform.sendPlayModeChange(this.playMode)
    },
    
    async handleAudioError(error: any) {
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
      return markRaw(new PlaybackErrorHandler({
        getState: () => ({
          songList: this.songList,
          currentIndex: this.currentIndex,
          playMode: this.playMode
        }),
        onStateChange: (changes) => {
          if (changes.playing !== undefined) this.playing = changes.playing
        }
      }))
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
    
    // Internal use or simple play
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

    // Comprehensive play action with URL fetching and lyrics
    async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
      const song = this.songList[index]
      if (!song) return

      this.loading = true
      // Fix: use platform instead of server, fallback to platform if server is missing
      const platformKey = song.platform || (song as any).server
      const adapter = getMusicAdapter(platformKey)
      
      console.log(`[Player] Playing song: ${song.name} (ID: ${song.id}, Platform: ${platformKey})`)

      try {
        // 1. Get URL if missing
        if (!song.url) {
          try {
            console.log('[Player] Fetching URL for song:', song.id)
            const mediaId = song.mediaId || (song.extra && song.extra.mediaId)
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
          } catch (urlError: any) {
             console.error('Failed to get song URL:', urlError)
             // 如果已经是 AppError (上面抛出的)，直接重抛
             if (urlError.name === 'AppError') throw urlError
             
             const err = Errors.noCopyright(song.id)
             errorCenter.emit(err)
             throw err
          }
        }

        // 2. Play
        await this.playSongByIndex(index)

        // 3. Get Lyrics
        try {
          const lyricData = await adapter.getLyric(song.id)
          
          let lrcText = lyricData.lrc || ''
          let tlyricText = lyricData.tlyric || ''
          let rlyricText = lyricData.romalrc || ''
          
          const lyrics = LyricParser.parse(lrcText, tlyricText, rlyricText)
          this.setLyricsArray(lyrics)
        } catch (lyricError) {
          console.error('Failed to get lyrics:', lyricError)
          this.setLyricsArray([])
        }
      } catch (error: any) {
        console.error('Playback failed:', error)
        
        if (!this.errorHandler) {
          this.errorHandler = this.createErrorHandler()
        }
        
        // 标记不可用，并设置消息
        // 如果是 AppError，使用其 getUserMessage
        const message = error.name === 'AppError' ? error.getUserMessage() : '该歌曲无法播放（可能需要 VIP 或受版权限制）'
        this.errorHandler.markAsUnavailable(song, message)
        
        // If autoSkip is false (called from error handler), throw error to let handler try next
        if (!autoSkip) {
          throw error
        }

        try {
          await this.playNextSkipUnavailable()
          return
        } catch (skipError) {
          errorCenter.emit(Errors.fatal('无法播放任何歌曲，请检查网络或切换歌单'))
        }
      } finally {
        this.loading = false
      }
    },
    
    togglePlay(): void {
      if (!this.initialized) {
        if (this.songList.length > 0) {
          this.playSongWithDetails(0)
        }
        return
      }
      
      audioManager.toggle()
      this.notifyPlayingState()
    },
    
    // 统一的随机播放辅助函数
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
      
      this.playSongWithDetails(newIndex).catch(err => {
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
      
      this.playSongWithDetails(newIndex).catch(err => {
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
    
    setLyric(lyric: any) {
      this.lyric = lyric
    },
    
    toggleCompactMode(): void {
      this.isCompact = !this.isCompact
      // 标记用户已显式设置过紧凑模式偏好
      localStorage.setItem('compactModeUserToggled', 'true')
    },

    setLyricsArray(lyrics: LyricLine[]) {
      this.lyricsArray = markRaw(lyrics) as LyricLine[]
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
    },
  },
  
  persist: {
    storage: localStorage,
    pick: ['volume', 'playMode', 'lyricType', 'isCompact'],
    // Note: songList and currentIndex are excluded to avoid stale URL issues
    // Songs will be re-fetched when needed
    beforeHydrate: (context: any) => {
      // 数据恢复前验证
      console.log('Restoring player state...')
    },
    afterHydrate: (context: any) => {
      const store = context.store as PlayerState
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
  },
})
