import { defineStore, type StoreGeneric } from 'pinia'
import { markRaw, toRaw } from 'vue'

import { SEND_CHANNELS } from '../../electron/shared/protocol/channels'
import type { PlayerStateSnapshot } from '../../electron/ipc/types'
import type { Song } from '../platform/music/interface'
import { services } from '../services'
import { getPlatformAccessor } from '../services/platformAccessor'
import { storageAdapter } from '../services/storageService'
import { createInitialState, PLAY_MODE_TEXTS, type PlayerState } from './player/playerState'
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
  toggleMute: () => void
  togglePlayMode: () => void
  setPlayMode: (mode: PlayerState['playMode']) => void
  setLyric: (lyric: unknown) => void
  toggleCompactMode: () => void
  setLyricsArray: (lyrics: LyricLine[]) => void
  clearPlaylist: () => void
}

type PlayerStoreInstance = PlayerState &
  PlayerStoreActions &
  PlayerStoreOwner & {
    $state: PlayerState
  } & StoreGeneric

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

function toIpcSerializable(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value == null) {
    return value
  }

  const valueType = typeof value
  if (valueType === 'bigint') {
    return value.toString()
  }

  if (valueType === 'function' || valueType === 'symbol') {
    return undefined
  }

  if (valueType !== 'object') {
    return value
  }

  const rawValue = toRaw(value as object)
  if (seen.has(rawValue)) {
    return seen.get(rawValue)
  }

  if (rawValue instanceof Date) {
    return new Date(rawValue.getTime())
  }

  if (rawValue instanceof RegExp) {
    return new RegExp(rawValue.source, rawValue.flags)
  }

  if (rawValue instanceof Error) {
    return {
      name: rawValue.name,
      message: rawValue.message,
      stack: rawValue.stack
    }
  }

  if (Array.isArray(rawValue)) {
    const serialized: unknown[] = []
    seen.set(rawValue, serialized)
    for (const item of rawValue) {
      const next = toIpcSerializable(item, seen)
      serialized.push(next === undefined ? null : next)
    }
    return serialized
  }

  const output: Record<string, unknown> = {}
  seen.set(rawValue, output)

  for (const [key, item] of Object.entries(rawValue as Record<string, unknown>)) {
    const next = toIpcSerializable(item, seen)
    if (next !== undefined) {
      output[key] = next
    }
  }

  return output
}

function createPlayerStateSnapshot(store: PlayerStoreInstance): PlayerStateSnapshot {
  return {
    isPlaying: store.playing,
    isLoading: store.loading,
    progress: store.progress,
    duration: store.duration,
    volume: store.volume,
    isMuted:
      store.initialized && typeof audioManager.getMuted === 'function'
        ? audioManager.getMuted()
        : store.volume === 0,
    playMode: store.playMode,
    playlist: toIpcSerializable(store.songList) as PlayerStateSnapshot['playlist'],
    currentIndex: store.currentIndex,
    currentSong: toIpcSerializable(store.currentSong) as PlayerStateSnapshot['currentSong'],
    currentLyricIndex: store.currentLyricIndex,
    showLyric: store.showLyric,
    showPlaylist: store.showPlaylist,
    isCompact: store.isCompact,
    lyrics: toIpcSerializable(store.lyricsArray) as PlayerStateSnapshot['lyrics']
  }
}

function notifyPlayerStateSnapshot(store: PlayerStoreInstance): void {
  const platform = getPlatformService()
  if (!platform.isElectron()) {
    return
  }

  platform.send(SEND_CHANNELS.PLAYER_SYNC_STATE, createPlayerStateSnapshot(store))
}

type StorePlayMode = PlayerState['playMode']
const PLAYER_STATE_SYNC_INTERVAL_MS = 500

function toPlayMode(mode: number): StorePlayMode {
  if (!Number.isFinite(mode) || !Number.isInteger(mode)) {
    return PLAY_MODE.SEQUENTIAL as StorePlayMode
  }

  const normalizedMode = ((mode % 4) + 4) % 4
  return normalizedMode as StorePlayMode
}

function isSameSong(left: Song, right: Song): boolean {
  return left.id === right.id && left.platform === right.platform
}

async function playSongFromIpc(
  store: PlayerStoreInstance,
  song: Song,
  playlist?: Song[]
): Promise<void> {
  if (Array.isArray(playlist) && playlist.length > 0) {
    const songIndex = playlist.findIndex(candidate => isSameSong(candidate, song))
    const nextPlaylist = songIndex === -1 ? [...playlist, song] : playlist

    store.setSongList(nextPlaylist)
    await store.playSongWithDetails(songIndex === -1 ? nextPlaylist.length - 1 : songIndex)
    return
  }

  const existingIndex = store.songList.findIndex(candidate => isSameSong(candidate, song))
  if (existingIndex !== -1) {
    await store.playSongWithDetails(existingIndex)
    return
  }

  store.addSong(song)
  await store.playSongWithDetails(store.songList.length - 1)
}

async function playSongByIdFromIpc(
  store: PlayerStoreInstance,
  id: string | number,
  platform: 'netease' | 'qq' = 'netease'
): Promise<void> {
  const existingIndex = store.songList.findIndex(
    song => song.id === id && (song.platform ?? 'netease') === platform
  )
  if (existingIndex !== -1) {
    await store.playSongWithDetails(existingIndex)
    return
  }

  const song = await services.music().getSongDetail(platform, id)
  if (!song) {
    throw new Error(`Unable to load song detail for ${platform}:${String(id)}`)
  }

  if (!song.platform) {
    song.platform = platform
  }

  await playSongFromIpc(store, song)
}

function addToNextFromIpc(store: PlayerStoreInstance, song: Song): void {
  const existingIndex = store.songList.findIndex(candidate => isSameSong(candidate, song))
  if (existingIndex !== -1) {
    store.songList.splice(existingIndex, 1)
    if (existingIndex < store.currentIndex) {
      store.currentIndex -= 1
    }
  }

  const insertIndex = Math.max(0, Math.min(store.currentIndex + 1, store.songList.length))
  store.songList.splice(insertIndex, 0, song)
  notifyPlayerStateSnapshot(store)
}

function removeFromPlaylistFromIpc(store: PlayerStoreInstance, index: number): void {
  if (index < 0 || index >= store.songList.length) {
    return
  }

  const removingCurrentSong = index === store.currentIndex
  store.songList.splice(index, 1)

  if (store.songList.length === 0) {
    store.clearPlaylist()
    return
  }

  if (index < store.currentIndex) {
    store.currentIndex -= 1
  } else if (removingCurrentSong) {
    store.currentIndex = Math.min(index, store.songList.length - 1)
    store.currentSong = store.songList[store.currentIndex]
    notifyPlayerStateSnapshot(store)
    void store.playSongWithDetails(store.currentIndex)
    return
  }

  store.currentSong =
    store.currentIndex >= 0 && store.currentIndex < store.songList.length
      ? store.songList[store.currentIndex]
      : null
  notifyPlayerStateSnapshot(store)
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
      notifyPlayerStateSnapshot(store)
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
          notifyPlayerStateSnapshot(store)
        },
        togglePlay: () => store.togglePlay(),
        toggleMute: () => store.toggleMute(),
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
        playSong: (song, playlist) => {
          void playSongFromIpc(store, song, playlist)
        },
        playSongById: (id, platform) => playSongByIdFromIpc(store, id, platform),
        addToNext: song => addToNextFromIpc(store, song),
        removeFromPlaylist: index => removeFromPlaylistFromIpc(store, index),
        clearPlaylist: () => store.clearPlaylist(),
        setPlayMode: mode => store.setPlayMode(mode),
        seek: time => store.seek(time),
        setVolume: vol => store.setVolume(vol),
        toggleCompactMode: () => store.toggleCompactMode(),
        platform: {
          isElectron: () => getPlatformService().isElectron(),
          on: (channel, callback) => getPlatformService().on(channel, callback)
        }
      })

      runtime.ensureStateSync(
        scheduleNotify => store.$subscribe(() => scheduleNotify()),
        () => notifyPlayerStateSnapshot(store),
        PLAYER_STATE_SYNC_INTERVAL_MS
      )

      notifyPlayerStateSnapshot(store)
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

    toggleMute(): void {
      const store = this as unknown as PlayerStoreInstance
      audioManager.setMuted(!audioManager.getMuted())
      notifyPlayerStateSnapshot(store)
    },

    togglePlayMode(): void {
      this.playMode = toPlayMode(this.playMode + 1)
      this.notifyPlayModeChange()
    },

    setPlayMode(mode: StorePlayMode): void {
      this.playMode = toPlayMode(mode)
      this.notifyPlayModeChange()
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

      notifyPlayerStateSnapshot(store)
      notifyLyricTimeUpdate(store, 0)
      resetPlayerStoreRuntime(store)
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
