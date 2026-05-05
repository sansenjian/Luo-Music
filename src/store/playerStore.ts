import { defineStore, type StoreGeneric } from 'pinia'
import { markRaw, toRaw } from 'vue'

import { handleError } from '@/utils/error'
import { DESKTOP_LYRIC_IPC_INTERVAL, LYRIC_UI_UPDATE_INTERVAL } from '@/constants/lyric'
import type { Song } from '@/platform/music/interface'
import { services } from '@/services'
import type { MusicService } from '@/services/musicService'
import type { PlatformService } from '@/services/platformService'
import { storageAdapter } from '@/services/storageService'
import type { StorageService } from '@/services/storageService'
import { isSameSongIdentity } from '@/utils/songIdentity'
import { hasKnownLocalSongDuration, isLocalLibrarySong } from '@/types/localLibrary'
import {
  createLyricTimeUpdatePayload,
  getCurrentLyricLine,
  getDesktopLyricSequence,
  notifyLyricTimeUpdate,
  resolveLyricIndex
} from '@/store/player/lyricSync'
import {
  ensurePlayerStoreRuntime,
  getPlayerStoreRuntime,
  resetPlayerStoreRuntime,
  type PlayerStoreOwner
} from '@/store/player/runtime'
import { createInitialState, PLAY_MODE_TEXTS, type PlayerState } from '@/store/player/playerState'
import { songPrefetcher } from '@/store/player/songPrefetcher'
import { PLAY_MODE } from '@/utils/player/constants/playMode'
import { LyricEngine, type LyricLine } from '@/utils/player/core/lyric'
import { playerCore as defaultAudioManager } from '@/utils/player/core/playerCore'
import { formatTime } from '@/utils/player/helpers/timeFormatter'
import { resolvePlaybackMediaUrl } from '@/utils/player/mediaProxy'
import { PlaybackErrorHandler } from '@/utils/player/modules/playbackErrorHandler'
import {
  DEFAULT_WEB_LYRIC_APPEARANCE,
  patchWebLyricAppearance,
  sanitizeWebLyricAppearance
} from '@/utils/player/webLyricAppearance'
import { useRecentPlayStore } from '@/store/recentPlayStore'
import type { SongPlatform } from '@/types/schemas'
import { SongSchema } from '@/types/schemas'
import type { LyricDisplayType, WebLyricAppearance } from '@/types/player'

import { SEND_CHANNELS } from '@/platform/contracts/protocol/channels'
import type { PlayerStateSnapshot, PlayerStateSyncPayload } from '@/platform/contracts/ipc'

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
  replaceQueue: (songs: Song[]) => void
  replaceQueueAndPlay: (songs: Song[], index: number) => Promise<void>
  addSong: (song: Song) => void
  playSongByIndex: (index: number, song?: Song) => Promise<void>
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
  setWebLyricAppearance: (patch: Partial<WebLyricAppearance>) => void
  resetWebLyricAppearance: () => void
  togglePlayerDocked: () => void
  setLyricsArray: (lyrics: LyricLine[]) => void
  removeSongFromPlaylist: (index: number) => void
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
> & {
  src?: string
}

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
  return isSameSongIdentity(left, right)
}

function normalizeLyricTypes(value: unknown): Array<'original' | 'trans' | 'roma'> {
  const allowedOptionalTypes: Array<'trans' | 'roma'> = ['trans', 'roma']
  const nextOptionalTypes = Array.isArray(value)
    ? allowedOptionalTypes.filter(type => value.includes(type))
    : ['trans']

  return ['original', ...nextOptionalTypes] as Array<'original' | 'trans' | 'roma'>
}

function normalizePlaylistSong(song: Song): Song {
  const normalizedSong = { ...song }

  delete normalizedSong.url
  delete normalizedSong.retryCount
  delete normalizedSong.unavailable
  delete normalizedSong.errorMessage

  return normalizedSong
}

function normalizePersistedPlaylist(value: unknown): Song[] {
  if (!Array.isArray(value)) {
    return []
  }

  const songs: Song[] = []
  let skipped = 0
  for (const item of value) {
    const parsed = SongSchema.safeParse(item)
    if (parsed.success) {
      songs.push(normalizePlaylistSong(parsed.data))
    } else {
      skipped++
    }
  }

  if (skipped > 0) {
    console.warn(`[playerStore] ${skipped} persisted song(s) failed validation and were discarded`)
  }

  return songs
}

function resolveCurrentIndexFromPlaylist(songs: Song[], currentIndex: unknown): number {
  if (!Array.isArray(songs) || songs.length === 0) {
    return -1
  }

  if (
    typeof currentIndex === 'number' &&
    Number.isInteger(currentIndex) &&
    currentIndex >= 0 &&
    currentIndex < songs.length
  ) {
    return currentIndex
  }

  return 0
}

export function restorePersistedPlayerState(store: PlayerState): void {
  store.songList = normalizePersistedPlaylist(store.songList)
  store.currentIndex = resolveCurrentIndexFromPlaylist(store.songList, store.currentIndex)
  store.currentSong =
    store.currentIndex >= 0 && store.currentIndex < store.songList.length
      ? store.songList[store.currentIndex]
      : null
  store.lyricSong = null
  store.lyric = null
  store.lyricsArray = []
  store.currentLyricIndex = -1
  store.loading = false
  store.playing = false
  store.progress = 0
  store.duration = 0
  store.initialized = false
  store.ipcInitialized = false
  store.trackSwitching = false
}

function isCurrentAudioSourceSong(song: Song | null, currentAudioSrc: string): boolean {
  if (!song?.url || !currentAudioSrc) {
    return false
  }

  return song.url === currentAudioSrc
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

  type PlayerStateSnapshotOptions = {
    includeHeavy?: boolean
  }

  function createPlayerStateSnapshot(
    store: PlayerStoreInstance,
    options: PlayerStateSnapshotOptions = {}
  ): PlayerStateSyncPayload {
    const includeHeavy = options.includeHeavy ?? true
    const snapshot: PlayerStateSyncPayload = {
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
      currentIndex: store.currentIndex,
      currentSong: toIpcSerializable(store.currentSong) as PlayerStateSnapshot['currentSong'],
      lyricSong: toIpcSerializable(store.lyricSong) as PlayerStateSnapshot['lyricSong'],
      currentLyricIndex: store.currentLyricIndex,
      showLyric: store.showLyric,
      showPlaylist: store.showPlaylist,
      isPlayerDocked: store.isPlayerDocked,
      lyricType: [...store.lyricType] as LyricDisplayType[],
      desktopLyricSequence: getDesktopLyricSequence(store)
    }

    if (includeHeavy) {
      snapshot.playlist = toIpcSerializable(store.songList) as PlayerStateSnapshot['playlist']
      snapshot.lyrics = toIpcSerializable(store.lyricsArray) as PlayerStateSnapshot['lyrics']
    }

    return snapshot
  }

  function notifyPlayerStateSnapshot(
    store: PlayerStoreInstance,
    options: PlayerStateSnapshotOptions = {}
  ): void {
    const platform = getPlatformService()
    if (!platform.isElectron()) {
      return
    }

    platform.send(SEND_CHANNELS.PLAYER_SYNC_STATE, createPlayerStateSnapshot(store, options))
  }

  function handlePlaybackActionFailure(
    store: PlayerStoreInstance,
    error: unknown,
    fn: string,
    customMessage: string
  ): void {
    reportPlayerStoreError(error, fn, customMessage)
    store.playing = false
    store.notifyPlayingState(false)
    notifyPlayerStateSnapshot(store)
  }

  async function playSongByIdFromIpc(
    store: PlayerStoreInstance,
    id: string | number,
    platform: SongPlatform = 'netease'
  ): Promise<void> {
    const existingIndex = store.songList.findIndex(
      song => song.id === id && (song.platform ?? 'netease') === platform
    )
    if (existingIndex !== -1) {
      await store.playSongWithDetails(existingIndex)
      return
    }

    if (platform === 'local') {
      throw new Error(`Unable to load local song detail for ${String(id)}`)
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
    const originalCurrentIndex = store.currentIndex
    const existingIndex = store.songList.findIndex(candidate => isSameSong(candidate, song))
    if (existingIndex !== -1) {
      store.songList.splice(existingIndex, 1)
      if (existingIndex < store.currentIndex) {
        store.currentIndex -= 1
      }
    }

    const insertIndex = Math.max(0, Math.min(store.currentIndex + 1, store.songList.length))
    store.songList.splice(insertIndex, 0, song)
    if (existingIndex === originalCurrentIndex) {
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
      void store.playSongWithDetails(store.currentIndex).catch(error => {
        store.currentSong =
          store.currentIndex >= 0 && store.currentIndex < store.songList.length
            ? store.songList[store.currentIndex]
            : null
        handlePlaybackActionFailure(
          store,
          error,
          'removeFromPlaylistFromIpc',
          'Failed to continue playback after removing the current song'
        )
      })
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
    let snapshotQueued = false
    // Track whether a heavy snapshot (playlist/lyrics changed) is needed
    // vs a lightweight playback-only update that the 500ms timer already covers.
    const heavyKeys = new Set([
      'songList',
      'currentSong',
      'lyricSong',
      'lyricsArray',
      'lyricType',
      'currentIndex',
      'showLyric',
      'showPlaylist',
      'isPlayerDocked',
      'playMode'
    ])
    let needsHeavySnapshot = false

    return runtime.ensurePlaybackActions({
      getState: () => store.$state,
      onStateChange: changes => {
        Object.assign(store, changes)
        // Check if any heavy (structural) field changed
        for (const key of Object.keys(changes)) {
          if (heavyKeys.has(key)) {
            needsHeavySnapshot = true
            break
          }
        }
        if (!snapshotQueued) {
          snapshotQueued = true
          queueMicrotask(() => {
            snapshotQueued = false
            if (needsHeavySnapshot) {
              needsHeavySnapshot = false
              notifyPlayerStateSnapshot(store)
            }
            // Lightweight changes (progress, playing, loading, currentLyricIndex)
            // are covered by the 500ms $subscribe state sync — no need to
            // serialize the full playlist and lyrics on every micro-task.
          })
        }
      },
      playSongByIndex: (index, song?) => store.playSongByIndex(index, song),
      setLyricsArray: lyrics => store.setLyricsArray(lyrics),
      onPlaybackCommitted: song => {
        useRecentPlayStore().recordSong(song)
      },
      musicService: (() => {
        const ms = getMusicService()
        songPrefetcher.setMusicService(ms)
        return ms
      })(),
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
              const currentAudioSrc = typeof audioManager.src === 'string' ? audioManager.src : ''
              const hasTrustedSongDuration =
                this.currentSong &&
                Number.isFinite(this.currentSong.duration) &&
                this.currentSong.duration > 0 &&
                (!isLocalLibrarySong(this.currentSong) ||
                  hasKnownLocalSongDuration(this.currentSong))
              const canUseSongDurationFallback =
                hasTrustedSongDuration &&
                isCurrentAudioSourceSong(this.currentSong, currentAudioSrc)
              const fallbackDuration =
                canUseSongDurationFallback && this.currentSong
                  ? this.currentSong.duration / 1000
                  : 0

              const resolvedDuration =
                Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration

              this.duration = resolvedDuration

              if (
                resolvedDuration > 0 &&
                this.currentSong &&
                isLocalLibrarySong(this.currentSong)
              ) {
                const resolvedDurationMs = Math.round(resolvedDuration * 1000)
                this.currentSong.duration = resolvedDurationMs
                this.currentSong.extra = {
                  ...this.currentSong.extra,
                  localDurationKnown: true
                }

                if (this.currentIndex >= 0 && this.currentIndex < this.songList.length) {
                  this.songList[this.currentIndex].duration = resolvedDurationMs
                  this.songList[this.currentIndex].extra = {
                    ...this.songList[this.currentIndex].extra,
                    localDurationKnown: true
                  }
                }
              }
            },
            onEnded: () => {
              this.handleSongEnd()
            },
            onPlay: () => {
              this.playing = true
              this.notifyPlayingState(true)
            },
            onPause: () => {
              if (this.trackSwitching) {
                return
              }
              this.playing = false
              this.notifyPlayingState(false)
            },
            onError: (error: unknown) => {
              if (this.trackSwitching) {
                return
              }

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
                    'Failed to play song during initialization'
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
          togglePlayerDocked: () => store.togglePlayerDocked(),
          platform: {
            isElectron: () => getPlatformService().isElectron(),
            on: (channel, callback) => getPlatformService().on(channel, callback)
          }
        })

        runtime.ensureStateSync(
          scheduleNotify => store.$subscribe(() => scheduleNotify()),
          () => notifyPlayerStateSnapshot(store, { includeHeavy: false }),
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
        if (this.trackSwitching) {
          return
        }

        const runtime = ensurePlayerStoreRuntime(this as unknown as PlayerStoreInstance)
        const errorHandler = runtime.ensureErrorHandler(() => this.createErrorHandler())
        const failedSong = this.currentSong
        const result = await errorHandler.handleAudioError(error, failedSong)

        if (result.shouldRetry && result.url) {
          if (!failedSong || !this.currentSong || !isSameSong(failedSong, this.currentSong)) {
            return
          }

          try {
            await audioManager.play(result.url)
            if (!this.currentSong || !isSameSong(failedSong, this.currentSong)) {
              return
            }
            failedSong.url = result.url
            this.currentSong.url = result.url
            this.playing = true
          } catch (retryError) {
            this.playing = false
            reportPlayerStoreError(
              retryError,
              'handleAudioError.retry',
              'Failed to play audio after retry'
            )
            const retryResult = await errorHandler.handleAudioError(retryError, this.currentSong)
            if (retryResult.shouldSkip) {
              try {
                await this.playNextSkipUnavailable()
              } catch (skipError) {
                reportPlayerStoreError(
                  skipError,
                  'handleAudioError.retry.skip',
                  'No playable songs remain after retry failure'
                )
              }
            }
          }
        } else if (result.shouldSkip) {
          try {
            await this.playNextSkipUnavailable()
          } catch (skipError) {
            reportPlayerStoreError(
              skipError,
              'handleAudioError.skip',
              'No playable songs remain after audio error'
            )
          }
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
          this.currentSong = newIndex >= 0 ? songs[newIndex] : null
        } else {
          this.currentIndex = -1
        }

        this.resetErrorHandler()
        getPlayerStoreRuntime(this as unknown as PlayerStoreOwner)?.resetPlaybackNavigation()
        notifyPlayerStateSnapshot(this as unknown as PlayerStoreInstance)
      },

      replaceQueue(songs: Song[]): void {
        this.setSongList(songs)
      },

      async replaceQueueAndPlay(songs: Song[], index: number): Promise<void> {
        if (songs.length === 0 || index < 0 || index >= songs.length) {
          return
        }

        this.setSongList(songs)
        await this.playSongWithDetails(index)
      },

      addSong(song: Song): void {
        this.songList.push(song)
        notifyPlayerStateSnapshot(this as unknown as PlayerStoreInstance)
      },

      async playSongByIndex(index: number, song?: Song): Promise<void> {
        if (index < 0 || index >= this.songList.length) {
          return
        }

        this.initAudio()

        const targetSong = song ?? this.songList[index]

        if (!targetSong.url) {
          const error = new Error('No URL for song')
          reportPlayerStoreError(error, 'playSongByIndex', 'No URL for song')
          throw error
        }

        // Set currentSong BEFORE audio.src changes so that MediaSession
        // watchers can populate metadata synchronously.  Both currentSong
        // and playing are updated in the same reactive tick so the
        // MediaSession sees the new song, not the stale one.
        if (this.currentSong !== targetSong) {
          this.currentSong = targetSong
          this.currentIndex = index
        }

        // Suppress the pause event that fires when audio.src changes so
        // that the MediaSession playbackState never drops to 'paused'
        // during the transition.  Without this, Windows SMTC sees an
        // inactive session and switches to another app's media control.
        this.trackSwitching = true

        try {
          const playbackUrl = resolvePlaybackMediaUrl(
            String(targetSong.url),
            getPlatformService().isElectron()
          )
          await audioManager.play(playbackUrl)
          this.playing = true
        } catch (error) {
          reportPlayerStoreError(error, 'playSongByIndex', 'Playback failed')
          this.playing = false
          throw error
        } finally {
          this.trackSwitching = false
        }
      },

      async playSongWithDetails(index: number, autoSkip = true): Promise<void> {
        await getPlaybackActions(this as unknown as PlayerStoreInstance).playSongWithDetails(
          index,
          autoSkip
        )
      },

      togglePlay(): void {
        const store = this as unknown as PlayerStoreInstance

        if (!this.initialized) {
          if (this.songList.length > 0) {
            const targetIndex = this.currentIndex >= 0 ? this.currentIndex : 0
            void this.playSongWithDetails(targetIndex).catch(error => {
              handlePlaybackActionFailure(
                store,
                error,
                'togglePlay.start',
                'Failed to start playback from togglePlay'
              )
            })
          }
          return
        }

        void Promise.resolve(audioManager.toggle()).catch(error => {
          handlePlaybackActionFailure(
            store,
            error,
            'togglePlay.toggle',
            'Failed to toggle playback'
          )
        })
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
        const store = this as unknown as PlayerStoreInstance

        if (this.playMode === PLAY_MODE.SINGLE_LOOP) {
          audioManager.seek(0)
          void audioManager.play().catch(error => {
            handlePlaybackActionFailure(
              store,
              error,
              'handleSongEnd.singleLoop',
              'Failed to replay the current song after it ended'
            )
            this.playNext()
          })
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

      setWebLyricAppearance(patch: Partial<WebLyricAppearance>): void {
        this.webLyricAppearance = patchWebLyricAppearance(this.webLyricAppearance, patch)
      },

      resetWebLyricAppearance(): void {
        this.webLyricAppearance = { ...DEFAULT_WEB_LYRIC_APPEARANCE }
      },

      togglePlayerDocked(): void {
        this.isPlayerDocked = !this.isPlayerDocked
        getStorageService().setItem('playerDockedUserToggled', 'true')
      },

      setLyricsArray(lyrics: LyricLine[]): void {
        const store = this as unknown as PlayerStoreInstance

        this.lyricsArray = markRaw(lyrics) as LyricLine[]
        this.lyricSong = lyrics.length > 0 ? this.currentSong : null
        this.currentLyricIndex = -1

        getPlayerStoreRuntime(store)?.getLyricEngine()?.setLyrics(lyrics)
        this.updateLyricIndex(this.progress)
        notifyPlayerStateSnapshot(store)
        notifyLyricTimeUpdate(store, getPlatformService(), this.progress, 'lyrics-load')
      },

      removeSongFromPlaylist(index: number): void {
        removeFromPlaylistFromIpc(this as unknown as PlayerStoreInstance, index)
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
      pick: [
        'volume',
        'playMode',
        'lyricType',
        'webLyricAppearance',
        'isPlayerDocked',
        'songList',
        'currentIndex'
      ],
      beforeHydrate: (_context: unknown) => {
        const rawPlayerState = storageAdapter.getItem(storeId)

        if (!rawPlayerState) {
          console.log('Restoring player state...')
          return
        }

        try {
          const parsed = JSON.parse(rawPlayerState) as Record<string, unknown>
          if (
            !Object.prototype.hasOwnProperty.call(parsed, 'isPlayerDocked') &&
            Object.prototype.hasOwnProperty.call(parsed, 'isCompact')
          ) {
            parsed.isPlayerDocked = parsed.isCompact
            delete parsed.isCompact
            storageAdapter.setItem(storeId, JSON.stringify(parsed))
          }
        } catch {
          // Ignore invalid persisted JSON here; existing hydration recovery handles it later.
        }

        console.log('Restoring player state...')
      },
      afterHydrate: (context: unknown) => {
        const store = (context as { store: PlayerState }).store

        restorePersistedPlayerState(store)

        if (typeof store.volume !== 'number' || !Number.isFinite(store.volume)) {
          store.volume = 0.7
        } else if (store.volume < 0 || store.volume > 1) {
          store.volume = 0.7
        }

        if (store.initialized) {
          audioManager.setVolume(store.volume)
        }

        if (
          typeof store.playMode !== 'number' ||
          !Number.isFinite(store.playMode) ||
          !Number.isInteger(store.playMode)
        ) {
          store.playMode = 0
        } else if (store.playMode < 0 || store.playMode > 3) {
          store.playMode = 0
        }

        store.lyricType = normalizeLyricTypes(store.lyricType)
        store.webLyricAppearance = sanitizeWebLyricAppearance(store.webLyricAppearance)
      }
    }
  })
}

export const usePlayerStore = createPlayerStore()
