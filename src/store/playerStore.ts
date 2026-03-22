import { defineStore } from 'pinia'
import { markRaw } from 'vue'

import type { Song } from '../platform/music/interface'
import { services } from '../services'
import { getPlatformAccessor } from '../services/platformAccessor'
import { storageAdapter } from '../services/storageService'
import {
  createInitialState,
  PLAY_MODE_TEXTS,
  type PlayerState
} from './player/playerState'
import {
  ensurePlayerStoreRuntime,
  getPlayerStoreRuntime,
  resetPlayerStoreRuntime,
  type CurrentLyricLine,
  type PlayerStoreOwner
} from './player/runtime'
import { playerCore as audioManager } from '../utils/player/core/playerCore'
import { LyricEngine, type LyricLine } from '../utils/player/core/lyric'
import { PLAY_MODE } from '../utils/player/constants/playMode'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { PlaybackErrorHandler } from '../utils/player/modules/playbackErrorHandler'

export type PlayerStoreActions = {
  seek: (time: number) => void
  playNextSkipUnavailable: () => Promise<void>
  initAudio: () => void
  setupIpcListeners: () => void
  teardownIpcListeners: () => void
  notifyPlayingState: (playing?: boolean) => void
  notifyPlayModeChange: () => void
  handleAudioError: (error: unknown) => Promise<void>
  createErrorHandler: () => PlaybackErrorHandler
  updateLyricIndex: (time?: number) => boolean
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

type PlayerStoreInstance = PlayerState &
  PlayerStoreActions &
  PlayerStoreOwner & {
    $state: PlayerState
  }

function getPlatformService() {
  return getPlatformAccessor()
}

function getCurrentLyricLine(store: PlayerStoreInstance): CurrentLyricLine {
  const line = store.lyricsArray[store.currentLyricIndex]
  return line ? { text: line.text, trans: line.trans || '', roma: line.roma || '' } : null
}

function notifyLyricTimeUpdate(store: PlayerStoreInstance, time = store.progress): void {
  const platform = getPlatformService()
  if (!platform.isElectron()) {
    return
  }

  const line = getCurrentLyricLine(store)
  platform.send('lyric-time-update', {
    time,
    index: store.currentLyricIndex,
    text: line?.text || '',
    trans: line?.trans || '',
    roma: line?.roma || '',
    playing: store.playing
  })
}

function syncLyricIndex(store: PlayerStoreInstance, time = store.progress): boolean {
  const lyricEngine = getPlayerStoreRuntime(store)?.getLyricEngine()
  if (!lyricEngine) {
    return false
  }

  const index = lyricEngine.update(time)
  if (store.currentLyricIndex === index) {
    return false
  }

  store.currentLyricIndex = index
  return true
}

function getPlaybackActions(store: PlayerStoreInstance) {
  const runtime = ensurePlayerStoreRuntime(store)

  return runtime.ensurePlaybackActions({
    getState: () => store.$state,
    onStateChange: changes => {
      Object.assign(store, changes)
    },
    playSongByIndex: index => store.playSongByIndex(index),
    setLyricsArray: lyrics => store.setLyricsArray(lyrics),
    createErrorHandler: () => runtime.ensureErrorHandler(() => store.createErrorHandler()),
    getErrorHandler: () => runtime.getErrorHandler(),
    platform: {
      isElectron: () => getPlatformService().isElectron()
    }
  })
}

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => createInitialState(),

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
      const store = this as unknown as PlayerStoreInstance

      audioManager.seek(time)
      this.progress = time
      syncLyricIndex(store, time)
      notifyLyricTimeUpdate(store, time)
    },

    async playNextSkipUnavailable(): Promise<void> {
      await getPlaybackActions(this as unknown as PlayerStoreInstance).playNextSkipUnavailable()
    },

    initAudio(): void {
      if (this.initialized) {
        return
      }

      const store = this as unknown as PlayerStoreInstance
      const runtime = ensurePlayerStoreRuntime(store)

      this.initialized = true
      runtime.setLyricEngine(new LyricEngine())
      runtime.setCurrentLyricLineProvider(() => getCurrentLyricLine(store))

      audioManager.setVolume(this.volume)

      runtime.configureAudioEventHandler(
        this.$state,
        {
          onTimeUpdate: (time: number) => {
            this.progress = time
            if (this.updateLyricIndex(time)) {
              notifyLyricTimeUpdate(store, time)
            }
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
            void this.handleAudioError(error)
          }
        },
        {
          uiUpdateInterval: 250,
          ipcBroadcastInterval: 500,
          getCurrentLyricLine: () => getCurrentLyricLine(store),
          syncLyricIndex: (time: number) => syncLyricIndex(store, time)
        },
        {
          isElectron: () => getPlatformService().isElectron(),
          send: (channel, data) => getPlatformService().send(channel, data)
        }
      )

      this.setupIpcListeners()
    },

    setupIpcListeners(): void {
      const store = this as unknown as PlayerStoreInstance
      const runtime = ensurePlayerStoreRuntime(store)

      runtime.setupIpcHandlers({
        getState: () => store.$state,
        onStateChange: changes => {
          Object.assign(store, changes)
        },
        togglePlay: () => store.togglePlay(),
        play: () => {
          if (!store.initialized) {
            if (store.songList.length > 0) {
              const targetIndex = store.currentIndex >= 0 ? store.currentIndex : 0
              void store.playSongWithDetails(targetIndex)
            }
            return
          }

          if (!store.playing) {
            void audioManager.play().catch(error => {
              if (!(error instanceof Error) || error.name !== 'AbortError') {
                console.error('Failed to resume playback:', error)
              }
            })
          }
        },
        pause: () => {
          if (store.initialized && store.playing) {
            audioManager.pause()
          }
        },
        playPrev: () => store.playPrev(),
        playNext: () => store.playNext(),
        setPlayMode: mode => store.setPlayMode(mode),
        setVolume: vol => store.setVolume(vol),
        toggleCompactMode: () => store.toggleCompactMode(),
        platform: {
          isElectron: () => getPlatformService().isElectron(),
          on: (channel, callback) => getPlatformService().on(channel, callback)
        }
      })

      this.ipcInitialized = true
    },

    teardownIpcListeners(): void {
      getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.teardownIpcHandlers()
      this.ipcInitialized = false
    },

    notifyPlayingState(playing?: boolean): void {
      getPlatformService().sendPlayingState(playing ?? this.playing)
    },

    notifyPlayModeChange(): void {
      getPlatformService().sendPlayModeChange(this.playMode)
    },

    async handleAudioError(error: unknown): Promise<void> {
      const runtime = ensurePlayerStoreRuntime(this as unknown as PlayerStoreInstance)
      const errorHandler = runtime.ensureErrorHandler(() => this.createErrorHandler())
      const result = await errorHandler.handleAudioError(error, this.currentSong)

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

    createErrorHandler(): PlaybackErrorHandler {
      return markRaw(
        new PlaybackErrorHandler({
          getState: () => ({
            songList: this.songList,
            currentIndex: this.currentIndex,
            playMode: this.playMode
          }),
          onStateChange: changes => {
            if (changes.playing !== undefined) {
              this.playing = changes.playing
            }
          }
        })
      )
    },

    updateLyricIndex(time?: number): boolean {
      const store = this as unknown as PlayerStoreInstance
      return syncLyricIndex(store, time ?? this.progress)
    },

    setSongList(songs: Song[]): void {
      this.songList = songs

      if (this.currentSong) {
        const newIndex = songs.findIndex(song => song.id === this.currentSong!.id)
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
      if (index < 0 || index >= this.songList.length) {
        return
      }

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
        console.error('Playback failed:', error)
        this.playing = false
        throw error
      }
    },

    async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
      await getPlaybackActions(this as unknown as PlayerStoreInstance).playSongWithDetails(
        index,
        autoSkip
      )
    },

    togglePlay(): void {
      if (!this.initialized) {
        if (this.songList.length > 0) {
          void this.playSongWithDetails(0)
        }
        return
      }

      void audioManager.toggle()
    },

    getRandomIndex(excludeCurrent = true): number {
      return getPlaybackActions(this as unknown as PlayerStoreInstance).getRandomIndex(
        excludeCurrent
      )
    },

    playPrev(): void {
      if (this.songList.length === 0) {
        return
      }

      getPlaybackActions(this as unknown as PlayerStoreInstance).playPrev()
    },

    playNext(): void {
      if (this.songList.length === 0) {
        return
      }

      getPlaybackActions(this as unknown as PlayerStoreInstance).playNext()
    },

    handleSongEnd(): void {
      if (this.playMode === PLAY_MODE.SINGLE_LOOP) {
        audioManager.seek(0)
        void audioManager.play()
      } else {
        this.playNext()
      }
    },

    resetErrorHandler(): void {
      getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.resetErrorHandler()
    },

    setVolume(vol: number): void {
      this.volume = Math.max(0, Math.min(1, vol))
      audioManager.setVolume(this.volume)
    },

    togglePlayMode(): void {
      this.playMode = (this.playMode + 1) % 4
      this.notifyPlayModeChange()
    },

    setPlayMode(mode: number): void {
      if (mode >= 0 && mode <= 3) {
        this.playMode = mode
        this.notifyPlayModeChange()
      }
    },

    setLyric(lyric: unknown): void {
      this.lyric = lyric
    },

    toggleCompactMode(): void {
      this.isCompact = !this.isCompact
      services.storage().setItem('compactModeUserToggled', 'true')
    },

    setLyricsArray(lyrics: LyricLine[]): void {
      const store = this as unknown as PlayerStoreInstance

      this.lyricsArray = markRaw(lyrics) as LyricLine[]
      this.currentLyricIndex = -1

      getPlayerStoreRuntime(store)?.getLyricEngine()?.setLyrics(lyrics)
      this.updateLyricIndex(this.progress)
      notifyLyricTimeUpdate(store)
    },

    clearPlaylist(): void {
      const store = this as unknown as PlayerStoreInstance

      resetPlayerStoreRuntime(store)

      this.songList = []
      this.currentIndex = -1
      this.currentSong = null
      this.lyric = null
      this.lyricsArray = []
      this.currentLyricIndex = -1
      this.loading = false
      this.ipcInitialized = false

      audioManager.pause()
      this.playing = false
      this.progress = 0
      this.duration = 0
      this.initialized = false

      notifyLyricTimeUpdate(store, 0)
    }
  },

  persist: {
    storage: storageAdapter,
    pick: ['volume', 'playMode', 'lyricType', 'isCompact'],
    beforeHydrate: (_context: unknown) => {
      console.log('Restoring player state...')
    },
    afterHydrate: (context: unknown) => {
      const store = (context as { store: PlayerState }).store

      if (store.volume < 0 || store.volume > 1) {
        store.volume = 0.7
      }

      if (store.initialized) {
        audioManager.setVolume(store.volume)
      }

      if (store.playMode < 0 || store.playMode > 3) {
        store.playMode = 0
      }

      if (!Array.isArray(store.lyricType) || store.lyricType.length === 0) {
        store.lyricType = ['original', 'trans']
      }
    }
  }
})
