import { defineStore, type StoreGeneric } from 'pinia'
import { markRaw, toRaw } from 'vue'

import { SEND_CHANNELS } from '../../electron/shared/protocol/channels'
import type { PlayerStateSnapshot } from '../../electron/ipc/types'
import type { Song } from '../platform/music/interface'
import type { MusicService } from '@/services/musicService'
import type { PlatformService } from '@/services/platformService'
import { services } from '../services'
import { storageAdapter } from '@/services/storageService'
import type { StorageService } from '@/services/storageService'
import { createInitialState, PLAY_MODE_TEXTS, type PlayerState } from './player/playerState'
import {
  ensurePlayerStoreRuntime,
  getPlayerStoreRuntime,
  resetPlayerStoreRuntime,
  type PlayerStoreOwner
} from './player/runtime'
import {
  createLyricTimeUpdatePayload,
  getCurrentLyricLine,
  getDesktopLyricSequence,
  notifyLyricTimeUpdate,
  resolveLyricIndex
} from './player/lyricSync'
import { playerCore as defaultAudioManager } from '../utils/player/core/playerCore'
import { LyricEngine, type LyricLine } from '../utils/player/core/lyric'
import { PLAY_MODE } from '../utils/player/constants/playMode'
import { formatTime } from '../utils/player/helpers/timeFormatter'
import { PlaybackErrorHandler } from '../utils/player/modules/playbackErrorHandler'
import { DESKTOP_LYRIC_IPC_INTERVAL, LYRIC_UI_UPDATE_INTERVAL } from '../constants/lyric'
import { handleError } from '@/utils/error'

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
  applyResolvedLyricIndex: (time?: number) => boolean
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
  toggleLyricType: (type: 'trans' | 'roma') => void
  toggleCompactMode: () => void
  setLyricsArray: (lyrics: LyricLine[]) => void
  clearPlaylist: () => void
}

type PlayerStoreInstance = PlayerState &
  PlayerStoreActions &
  PlayerStoreOwner & {
    $state: PlayerState
  } & StoreGeneric

type PlayerStoreMusicService = Pick<MusicService, 'getSongUrl' | 'getSongDetail' | 'getLyric'>
type PlayerStoreStorageService = Pick<StorageService, 'setItem'>
type PlayerStorePlatformService = Pick<
  PlatformService,
  'isElectron' | 'send' | 'sendPlayingState' | 'sendPlayModeChange' | 'on'
>
type PlayerStoreAudioManager = Pick<
  typeof defaultAudioManager,
  'getMuted' | 'pause' | 'play' | 'seek' | 'setMuted' | 'setVolume' | 'toggle'
>

export type PlayerStoreDeps = {
  getMusicService?: () => PlayerStoreMusicService
  getStorageService?: () => PlayerStoreStorageService
  getPlatformAccessor?: () => PlayerStorePlatformService
  audioManager?: PlayerStoreAudioManager
}

function getDefaultPlayerStoreDeps(): Required<PlayerStoreDeps> {
  return {
    getMusicService: () => services.music(),
    getStorageService: () => services.storage(),
    getPlatformAccessor: () => services.platform(),
    audioManager: defaultAudioManager
  }
}

function resolvePlayerStoreDeps(deps: PlayerStoreDeps): Required<PlayerStoreDeps> {
  const defaultDeps = getDefaultPlayerStoreDeps()

  return {
    getMusicService: deps.getMusicService ?? defaultDeps.getMusicService,
    getStorageService: deps.getStorageService ?? defaultDeps.getStorageService,
    getPlatformAccessor: deps.getPlatformAccessor ?? defaultDeps.getPlatformAccessor,
    audioManager: deps.audioManager ?? defaultDeps.audioManager
  }
}

/**
 * Convert a value into an IPC-safe representation suitable for sending between processes.
 *
 * Recursively transforms the input into primitives, plain objects, and arrays while handling cycles.
 * Special cases:
 * - `bigint` is converted to its decimal string.
 * - `function` and `symbol` values are dropped (`undefined`); when appearing in arrays they become `null`.
 * - `Date` and `RegExp` are converted to new equivalent instances.
 * - `Error` is converted to an object with `name`, `message`, and `stack`.
 *
 * @param value - The value to serialize for IPC transport.
 * @param seen - Internal WeakMap used to track visited objects and handle cyclic references; callers can omit.
 * @returns A representation of `value` safe for IPC (primitives, arrays, or plain objects), or `undefined` when the input cannot be represented.
 */
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

function normalizeLyricTypes(value: unknown): Array<'original' | 'trans' | 'roma'> {
  const allowedOptionalTypes: Array<'trans' | 'roma'> = ['trans', 'roma']
  const nextOptionalTypes = Array.isArray(value)
    ? allowedOptionalTypes.filter(type => value.includes(type))
    : ['trans']

  return ['original', ...nextOptionalTypes] as Array<'original' | 'trans' | 'roma'>
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

export function createPlayerStore(deps: PlayerStoreDeps = {}, storeId = 'player') {
  const resolvedDeps = resolvePlayerStoreDeps(deps)
  const getMusicService = resolvedDeps.getMusicService
  const getStorageService = resolvedDeps.getStorageService
  const getPlatformService = resolvedDeps.getPlatformAccessor
  const audioManager = resolvedDeps.audioManager

  function reportPlayerStoreError(
    error: unknown,
    fn: string,
    customMessage: string,
    recoverable = true
  ): void {
    handleError(error, {
      customMessage,
      recoverable,
      context: {
        module: 'PlayerStore',
        fn
      }
    })
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
      lyricSong: toIpcSerializable(store.lyricSong) as PlayerStateSnapshot['lyricSong'],
      currentLyricIndex: store.currentLyricIndex,
      showLyric: store.showLyric,
      showPlaylist: store.showPlaylist,
      isCompact: store.isCompact,
      lyrics: toIpcSerializable(store.lyricsArray) as PlayerStateSnapshot['lyrics'],
      desktopLyricSequence: getDesktopLyricSequence(store)
    }
  }

  function notifyPlayerStateSnapshot(store: PlayerStoreInstance): void {
    const platform = getPlatformService()
    if (!platform.isElectron()) {
      return
    }

    platform.send(SEND_CHANNELS.PLAYER_SYNC_STATE, createPlayerStateSnapshot(store))
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

    const song = await getMusicService().getSongDetail(platform, id)
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
    if (existingIndex === store.currentIndex) {
      store.currentIndex = insertIndex
    }
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
      musicService: getMusicService(),
      createErrorHandler: () => runtime.ensureErrorHandler(() => store.createErrorHandler()),
      getErrorHandler: () => runtime.getErrorHandler(),
      platform: {
        isElectron: () => getPlatformService().isElectron()
      }
    })
  }

  return defineStore(storeId, {
    state: (): PlayerState => createInitialState(),

    getters: {
      hasSongs: state => state.songList.length > 0,

      currentSongInfo: (state): Song | null => {
        if (state.currentSong) {
          return state.currentSong
        }

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
      applyResolvedLyricIndex(this: PlayerStoreInstance, time = this.progress): boolean {
        const store = this as unknown as PlayerStoreInstance
        const nextIndex = resolveLyricIndex(store, time)

        if (nextIndex === null || this.currentLyricIndex === nextIndex) {
          return false
        }

        this.currentLyricIndex = nextIndex
        return true
      },

      seek(time: number): void {
        const store = this as unknown as PlayerStoreInstance

        audioManager.seek(time)
        this.progress = time
        this.applyResolvedLyricIndex(time)
        notifyLyricTimeUpdate(store, getPlatformService(), time, 'seek')
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
                notifyLyricTimeUpdate(store, getPlatformService(), time, 'lyric-change')
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
              reportPlayerStoreError(error, 'initAudio.onError', 'Audio error')
              void this.handleAudioError(error)
            }
          },
          {
            uiUpdateInterval: LYRIC_UI_UPDATE_INTERVAL,
            ipcBroadcastInterval: DESKTOP_LYRIC_IPC_INTERVAL,
            getCurrentLyricLine: () => getCurrentLyricLine(store),
            syncLyricIndex: (time: number) => this.applyResolvedLyricIndex(time),
            createLyricUpdatePayload: ({ time, cause }) =>
              createLyricTimeUpdatePayload(store, time, cause)
          },
          {
            isElectron: () => getPlatformService().isElectron(),
            send: (channel, data) => getPlatformService().send(channel, data)
          }
        )

        this.setupIpcListeners()
      },

      setupIpcListeners(): void {
        if (this.ipcInitialized) {
          return
        }

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
                return store.playSongWithDetails(targetIndex).catch(error => {
                  reportPlayerStoreError(
                    error,
                    'setupIpcListeners.play.uninitialized',
                    'Failed to play song from uninitialized state'
                  )
                  throw error
                })
              }
              return
            }

            if (!store.playing) {
              return audioManager.play().catch(error => {
                if (!(error instanceof Error) || error.name !== 'AbortError') {
                  reportPlayerStoreError(
                    error,
                    'setupIpcListeners.play',
                    'Failed to resume playback'
                  )
                }
                throw error
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
            return playSongFromIpc(store, song, playlist).catch(error => {
              reportPlayerStoreError(
                error,
                'setupIpcListeners.playSong',
                'Failed to play song from IPC'
              )
              throw error
            })
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
          try {
            if (this.currentSong) {
              this.currentSong.url = result.url
            }

            await audioManager.play(result.url)
            this.playing = true
          } catch (retryError) {
            this.playing = false
            reportPlayerStoreError(
              retryError,
              'handleAudioError.retry',
              'Failed to retry playback after error'
            )
            const retryResult = await errorHandler.handleAudioError(retryError, this.currentSong)
            if (retryResult.shouldSkip) {
              this.playNext()
            }
          }
        } else if (result.shouldSkip) {
          this.playNext()
        }
      },

      createErrorHandler(): PlaybackErrorHandler {
        return markRaw(
          new PlaybackErrorHandler({
            musicService: getMusicService(),
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
        return this.applyResolvedLyricIndex(time ?? this.progress)
      },

      setSongList(songs: Song[]): void {
        this.songList = songs

        if (this.currentSong) {
          const newIndex = songs.findIndex(song => isSameSong(song, this.currentSong!))
          this.currentIndex = newIndex
          if (newIndex === -1) {
            this.currentSong = null
          }
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

        const song = this.songList[index]

        if (!song.url) {
          const error = new Error('No URL for song')
          reportPlayerStoreError(error, 'playSongByIndex', 'No URL for song')
          throw error
        }

        try {
          await audioManager.play(String(song.url))
          this.playing = true
        } catch (error) {
          reportPlayerStoreError(error, 'playSongByIndex', 'Playback failed')
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

      toggleLyricType(type: 'trans' | 'roma'): void {
        const currentTypes = normalizeLyricTypes(this.lyricType)
        const nextOptionalTypes = currentTypes.includes(type)
          ? currentTypes.filter(item => item !== 'original' && item !== type)
          : [...currentTypes.filter(item => item !== 'original'), type]

        this.lyricType = ['original', ...new Set(nextOptionalTypes)]
      },

      toggleCompactMode(): void {
        this.isCompact = !this.isCompact
        getStorageService().setItem('compactModeUserToggled', 'true')
      },

      setLyricsArray(lyrics: LyricLine[]): void {
        const store = this as unknown as PlayerStoreInstance

        this.lyricsArray = markRaw(lyrics) as LyricLine[]
        this.lyricSong = lyrics.length > 0 ? this.currentSong : null
        this.currentLyricIndex = -1

        getPlayerStoreRuntime(store)?.getLyricEngine()?.setLyrics(lyrics)
        this.updateLyricIndex(this.progress)
        notifyLyricTimeUpdate(store, getPlatformService(), this.progress, 'lyrics-load')
      },

      clearPlaylist(): void {
        const store = this as unknown as PlayerStoreInstance

        this.songList = []
        this.currentIndex = -1
        this.currentSong = null
        this.lyricSong = null
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
        notifyLyricTimeUpdate(store, getPlatformService(), 0, 'reset')
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

        if (
          typeof store.volume !== 'number' ||
          !Number.isFinite(store.volume) ||
          store.volume < 0 ||
          store.volume > 1
        ) {
          store.volume = 0.7
        }

        if (store.initialized && typeof store.volume === 'number' && Number.isFinite(store.volume)) {
          audioManager.setVolume(store.volume)
        }

        if (
          typeof store.playMode !== 'number' ||
          !Number.isFinite(store.playMode) ||
          !Number.isInteger(store.playMode) ||
          store.playMode < 0 ||
          store.playMode > 3
        ) {
          store.playMode = 0
        }

        store.lyricType = normalizeLyricTypes(store.lyricType)
      }
    }
  })
}

export const usePlayerStore = createPlayerStore()