import { PLAY_MODE } from '@shared/player/playMode'
import { sanitizeWebLyricAppearance } from '@/utils/player/webLyricAppearance'
import { MAX_PLAYLIST_SIZE } from '@/store/player/playerState'
import {
  normalizePersistedPlaylist,
  PLAYER_PERSISTED_STATE_VERSION,
  resolveCurrentIndexFromPlaylist,
  resolveRestoredDuration,
  resolveRestoredProgress,
  sanitizePersistedPlayerState
} from '@/utils/player/persistedPlayerState'
import type { PlayerStoreAudioManager } from './playerStoreDeps'
import type { PlayerState } from './playerState'

export type StorePlayMode = PlayerState['playMode']

export function toPlayMode(mode: number): StorePlayMode {
  if (!Number.isFinite(mode) || !Number.isInteger(mode)) {
    return PLAY_MODE.SEQUENTIAL as StorePlayMode
  }

  const normalizedMode = ((mode % 4) + 4) % 4
  return normalizedMode as StorePlayMode
}

export function normalizeLyricTypes(value: unknown): Array<'original' | 'trans' | 'roma'> {
  const allowedOptionalTypes: Array<'trans' | 'roma'> = ['trans', 'roma']
  const nextOptionalTypes = Array.isArray(value)
    ? allowedOptionalTypes.filter(type => value.includes(type))
    : ['trans']

  return ['original', ...nextOptionalTypes] as Array<'original' | 'trans' | 'roma'>
}

export function restorePersistedPlayerState(store: PlayerState): void {
  store.songList = normalizePersistedPlaylist(store.songList, {
    onSkipped: skipped => {
      console.warn(
        `[playerStore] ${skipped} persisted song(s) failed validation and were discarded`
      )
    }
  })
  store.currentIndex = resolveCurrentIndexFromPlaylist(store.songList, store.currentIndex)
  store.currentSong =
    store.currentIndex >= 0 && store.currentIndex < store.songList.length
      ? store.songList[store.currentIndex]
      : null
  const restoredDuration = resolveRestoredDuration(store.currentSong, store.duration)
  const restoredProgress = resolveRestoredProgress(
    store.currentSong,
    store.progress,
    restoredDuration
  )

  store.lyricSong = null
  store.lyric = null
  store.lyricsArray = []
  store.currentLyricIndex = -1
  store.loading = false
  store.playing = false
  store.progress = restoredProgress
  store.duration = restoredDuration
  store.initialized = false
  store.ipcInitialized = false
  store.trackSwitching = false
}

export function normalizeHydratedPlayerState(
  store: PlayerState,
  audioManager: PlayerStoreAudioManager
): void {
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
    store.playMode = PLAY_MODE.SEQUENTIAL
  } else if (store.playMode < 0 || store.playMode > 3) {
    store.playMode = PLAY_MODE.SEQUENTIAL
  }

  store.lyricType = normalizeLyricTypes(store.lyricType)
  store.webLyricAppearance = sanitizeWebLyricAppearance(store.webLyricAppearance)

  // 限制播放列表长度，防止持久化的大歌单撑爆内存
  if (Array.isArray(store.songList) && store.songList.length > MAX_PLAYLIST_SIZE) {
    const songsToKeep = store.songList.slice(-MAX_PLAYLIST_SIZE)
    store.songList = songsToKeep
    store.currentIndex =
      store.currentIndex >= 0
        ? store.currentIndex - (store.songList.length - MAX_PLAYLIST_SIZE)
        : -1
    if (store.currentIndex < 0 || store.currentIndex >= MAX_PLAYLIST_SIZE) {
      store.currentIndex = -1
    }
  }
}

type PlayerPersistStorage = Pick<
  Storage,
  'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'
> & {
  readonly length: number
}

export type PlayerPersistStorageOptions = {
  progressThrottleMs?: number
}

const DEFAULT_PROGRESS_PERSIST_THROTTLE_MS = 1000
const PLAYBACK_PROGRESS_KEYS = new Set(['progress', 'duration'])

function serializeSanitizedPlayerState(value: string): string {
  try {
    return JSON.stringify(sanitizePersistedPlayerState(JSON.parse(value) as unknown))
  } catch {
    return JSON.stringify(sanitizePersistedPlayerState(null))
  }
}

function getStructuralSignature(serializedValue: string | null): string | null {
  if (!serializedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(serializedValue) as Record<string, unknown>
    const structuralState = Object.fromEntries(
      Object.entries(parsed).filter(
        ([key]) => !PLAYBACK_PROGRESS_KEYS.has(key) && key !== 'version'
      )
    )

    return JSON.stringify({
      version: PLAYER_PERSISTED_STATE_VERSION,
      ...structuralState
    })
  } catch {
    return null
  }
}

function isProgressOnlyPersistUpdate(previousValue: string | null, nextValue: string): boolean {
  const previousSignature = getStructuralSignature(previousValue)
  const nextSignature = getStructuralSignature(nextValue)

  return previousSignature !== null && previousSignature === nextSignature
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) {
    clearTimeout(timer)
  }
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof timer.unref === 'function'
  ) {
    timer.unref()
  }
}

export function createPlayerPersistStorage(
  storage: PlayerPersistStorage,
  options: PlayerPersistStorageOptions = {}
): PlayerPersistStorage {
  const progressThrottleMs = options.progressThrottleMs ?? DEFAULT_PROGRESS_PERSIST_THROTTLE_MS
  const lastPersistedValues = new Map<string, string>()
  const lastPersistedTimes = new Map<string, number>()
  const pendingValues = new Map<string, string>()
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function persistValue(key: string, value: string): void {
    storage.setItem(key, value)
    lastPersistedValues.set(key, value)
    lastPersistedTimes.set(key, Date.now())
  }

  function writeNow(key: string, value: string): void {
    persistValue(key, value)
    clearTimer(pendingTimers.get(key) ?? null)
    pendingTimers.delete(key)
    pendingValues.delete(key)
  }

  function flushPendingWrite(key: string): void {
    const pendingValue = pendingValues.get(key)
    if (pendingValue === undefined) {
      pendingTimers.delete(key)
      return
    }

    try {
      persistValue(key, pendingValue)
      pendingValues.delete(key)
      pendingTimers.delete(key)
    } catch (error) {
      console.warn('[playerPersistence] Failed to persist throttled player state', error)
      const retryTimer = setTimeout(() => flushPendingWrite(key), progressThrottleMs)
      unrefTimer(retryTimer)
      pendingTimers.set(key, retryTimer)
    }
  }

  function scheduleWrite(key: string, value: string, delay: number): void {
    pendingValues.set(key, value)

    if (pendingTimers.has(key)) {
      return
    }

    const timer = setTimeout(() => flushPendingWrite(key), delay)

    unrefTimer(timer)
    pendingTimers.set(key, timer)
  }

  return {
    get length(): number {
      return storage.length
    },
    clear(): void {
      for (const timer of pendingTimers.values()) {
        clearTimer(timer)
      }
      pendingTimers.clear()
      pendingValues.clear()
      lastPersistedValues.clear()
      lastPersistedTimes.clear()
      storage.clear()
    },
    getItem(key: string): string | null {
      return pendingValues.get(key) ?? storage.getItem(key)
    },
    key(index: number): string | null {
      return storage.key(index)
    },
    removeItem(key: string): void {
      clearTimer(pendingTimers.get(key) ?? null)
      pendingTimers.delete(key)
      pendingValues.delete(key)
      lastPersistedValues.delete(key)
      lastPersistedTimes.delete(key)
      storage.removeItem(key)
    },
    setItem(key: string, value: string): void {
      const sanitizedValue = serializeSanitizedPlayerState(value)
      const previousValue =
        pendingValues.get(key) ?? lastPersistedValues.get(key) ?? storage.getItem(key)

      if (!isProgressOnlyPersistUpdate(previousValue, sanitizedValue)) {
        writeNow(key, sanitizedValue)
        return
      }

      const elapsed = Date.now() - (lastPersistedTimes.get(key) ?? 0)
      if (elapsed >= progressThrottleMs) {
        writeNow(key, sanitizedValue)
        return
      }

      scheduleWrite(key, sanitizedValue, progressThrottleMs - elapsed)
    }
  }
}
