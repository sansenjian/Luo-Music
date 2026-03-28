import { computed, onMounted, onUnmounted, ref } from 'vue'

import { services } from '../services'
import type { Song } from '../types/schemas'
import type { LyricLine } from '../utils/player/core/lyric'
import type {
  DesktopLyricSnapshot,
  DesktopLyricUpdateCause,
  LyricTimeUpdate
} from '../../electron/ipc/types'

interface IpcLyricPayload extends Partial<LyricTimeUpdate> {
  romalrc?: string
}

interface PlayerStateSnapshot {
  isPlaying: boolean
  currentIndex: number
  currentSong: Song | null
  currentLyricIndex: number
  progress?: number
}

interface PlayerBridge {
  getDesktopLyricSnapshot?: () => Promise<DesktopLyricSnapshot>
  getState?: () => Promise<PlayerStateSnapshot>
  getCurrentSong?: () => Promise<Song | null>
  getLyric?: (songId: string | number, platform?: 'netease' | 'qq') => Promise<LyricLine[]>
  onPlayStateChange?: (
    listener: (data: { isPlaying: boolean; currentTime: number }) => void
  ) => () => void
  onSongChange?: (listener: (data: { song: Song | null; index: number }) => void) => () => void
}

/**
 * Retrieve the optional PlayerBridge exposed on window.services when available.
 *
 * @returns The `PlayerBridge` found at `window.services.player`, or `undefined` if `window` is not present or the bridge is missing.
 */
function getPlayerBridge(): PlayerBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window).services?.player
}

/**
 * Create a LyricLine from an IPC lyric payload when the payload carries a valid lyric index.
 *
 * @param payload - IPC lyric payload; used to populate lyric text, translation, and romanization
 * @returns A `LyricLine` with `time` set to `0` and `text`/`trans`/`roma` taken from the payload, or `null` if `payload.index` is negative or missing
 */
function createLyricLineFromPayload(payload: IpcLyricPayload): LyricLine | null {
  const index = payload.index ?? -1
  if (index < 0) {
    return null
  }

  return {
    time: 0,
    text: payload.text || '',
    trans: payload.trans || '',
    roma: payload.roma || payload.romalrc || ''
  }
}

/**
 * Finds the index of the last lyric line whose timestamp is less than or equal to the given time.
 *
 * @param lyrics - An array of lyric lines sorted by ascending `time`
 * @param currentTime - Playback time (in seconds)
 * @returns The largest index `i` such that `lyrics[i].time <= currentTime`, or `-1` if no such index exists
 */
function resolveLyricIndexByTime(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) {
    return -1
  }

  let left = 0
  let right = lyrics.length - 1
  let index = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (lyrics[mid].time <= currentTime) {
      index = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return index
}

/**
 * Determines whether the provided song matches the given song ID and platform.
 *
 * @param song - The song object to compare; may be `null`.
 * @param songId - The expected song identifier; when `null` or `undefined`, the function returns `false`.
 * @param platform - The expected platform (`'netease'` or `'qq'`). If omitted or `null`, `'netease'` is assumed; if `song.platform` is missing, it is treated as `'netease'`.
 * @returns `true` if `song` is non-null, `song.id === songId`, and the resolved platforms are equal; `false` otherwise.
 */
function isSameSong(
  song: Song | null,
  songId?: string | number | null,
  platform?: 'netease' | 'qq' | null
): boolean {
  if (!song || songId == null) {
    return false
  }

  return song.id === songId && (song.platform ?? 'netease') === (platform ?? 'netease')
}

const DESKTOP_LYRIC_DEBUG_STORAGE_KEY = 'luo.desktopLyricDebug'

/**
 * Determine if a desktop lyric debug flag string indicates debug is enabled.
 *
 * @param flag - Flag string to evaluate; recognized values are "1", "true", "on", or "debug" (case-insensitive)
 * @returns `true` if the flag matches one of the recognized values, `false` otherwise.
 */
function isDesktopLyricDebugFlagEnabled(flag?: string | null): boolean {
  return /^(1|true|on|debug)$/i.test(flag ?? '')
}

/**
 * Determines whether desktop lyric debug logging is enabled.
 *
 * Checks the `VITE_DESKTOP_LYRIC_DEBUG` environment variable first, enables debug in development mode
 * (unless MODE === 'test'), and falls back to the `luo.desktopLyricDebug` localStorage key when available.
 *
 * @returns `true` if desktop lyric debug logging is enabled, `false` otherwise.
 */
function isDesktopLyricDebugEnabled(): boolean {
  if (isDesktopLyricDebugFlagEnabled(import.meta.env.VITE_DESKTOP_LYRIC_DEBUG)) {
    return true
  }

  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  try {
    return isDesktopLyricDebugFlagEnabled(
      window.localStorage.getItem(DESKTOP_LYRIC_DEBUG_STORAGE_KEY)
    )
  } catch {
    return false
  }
}

/**
 * Logs a desktop-lyric debug message when desktop lyric debugging is enabled.
 *
 * @param source - Origin of the debug message: `'snapshot'`, `'push'`, or `'fallback'`
 * @param event - A short, descriptive event name
 * @param details - Additional contextual properties to include with the log
 */
function logDesktopLyricDebug(
  source: 'snapshot' | 'push' | 'fallback',
  event: string,
  details: Record<string, unknown> = {}
): void {
  if (!isDesktopLyricDebugEnabled()) {
    return
  }

  console.debug('[DesktopLyric]', event, {
    source,
    ...details
  })
}

/**
 * Provides a reactive Vue state object that synchronizes the currently active lyric line with desktop IPC and player events (Electron).
 *
 * @param emptyText - Text to use when there is no lyric text available (defaults to `''`)
 * @returns An object containing reactive lyric state:
 * - `lyrics`: cached full lyric lines
 * - `currentLyricIndex`: active lyric index (or `-1` when unknown)
 * - `currentLine`: the active `LyricLine` or `null`
 * - `currentLyric`: displayed original lyric text (falls back to `emptyText`)
 * - `currentTrans`: displayed translated lyric text
 * - `currentRoma`: displayed romanization text
 * - `secondaryLyric`: `currentTrans` or `currentRoma`, whichever is present
 * - `isPlaying`: whether playback is currently active
 * - `showOriginal`, `showTrans`, `showRoma`: display flags (always `true`)
 */
export function useIpcActiveLyricState(emptyText = '') {
  const RECENT_LYRIC_PUSH_GUARD_MS = 1200
  const platformService = services.platform()
  const ipcLyricIndex = ref(-1)
  const ipcProgress = ref(0)
  const ipcLyricText = ref(emptyText)
  const ipcLyricTrans = ref('')
  const ipcLyricRoma = ref('')
  const ipcCurrentLine = ref<LyricLine | null>(null)
  const ipcIsPlaying = ref(false)
  const cachedLyrics = ref<LyricLine[]>([])
  const currentSong = ref<Song | null>(null)
  const unsubscribers: Array<() => void> = []
  let hydrationVersion = 0
  let lastLyricPushAt = 0
  let lastAcceptedSequence = 0

  function clearDisplayLyrics() {
    ipcLyricText.value = emptyText
    ipcLyricTrans.value = ''
    ipcLyricRoma.value = ''
  }

  function resetCurrentLine() {
    clearDisplayLyrics()
    ipcCurrentLine.value = null
  }

  function setCurrentLine(line: LyricLine | null) {
    ipcCurrentLine.value = line
  }

  function setDisplayLyricsFromLine(line: LyricLine | null) {
    ipcLyricText.value = line?.text ?? emptyText
    ipcLyricTrans.value = line?.trans ?? ''
    ipcLyricRoma.value = line?.roma ?? ''
  }

  function resolveCurrentLine(
    lyrics: LyricLine[],
    index: number,
    progress: number
  ): LyricLine | null {
    if (index >= 0) {
      return lyrics[index] ?? null
    }

    const resolvedIndex = resolveLyricIndexByTime(lyrics, progress)
    return resolvedIndex >= 0 ? (lyrics[resolvedIndex] ?? null) : null
  }

  function refreshDisplayFromCachedLyrics() {
    const nextIndex = resolveLyricIndexByTime(cachedLyrics.value, ipcProgress.value)
    ipcLyricIndex.value = nextIndex
    const line = nextIndex >= 0 ? (cachedLyrics.value[nextIndex] ?? null) : null
    setCurrentLine(line)
    setDisplayLyricsFromLine(line)
  }

  async function hydrateCurrentLyricFromPlayer(): Promise<void> {
    const playerBridge = getPlayerBridge()
    if (!platformService.isElectron() || !playerBridge) {
      return
    }

    try {
      const nextHydrationVersion = ++hydrationVersion
      let snapshotSong: Song | null = null
      let snapshotLyrics: LyricLine[] = []
      let snapshotIndex = -1
      let snapshotProgress = 0
      let snapshotPlaying = false
      let snapshotSequence = 0

      if (playerBridge.getDesktopLyricSnapshot) {
        const snapshot = await playerBridge.getDesktopLyricSnapshot()
        snapshotSong = snapshot.currentSong
        snapshotLyrics = snapshot.lyrics ?? []
        snapshotIndex = snapshot.currentLyricIndex ?? -1
        snapshotProgress = snapshot.progress ?? 0
        snapshotPlaying = snapshot.isPlaying ?? false
        snapshotSequence = snapshot.sequence ?? 0

        logDesktopLyricDebug('snapshot', 'hydrate-desktop-lyric-snapshot', {
          songId: snapshot.songId ?? snapshot.currentSong?.id ?? null,
          platform: snapshot.platform ?? snapshot.currentSong?.platform ?? null,
          currentTime: snapshot.progress ?? 0,
          currentLyricIndex: snapshot.currentLyricIndex ?? -1,
          sequence: snapshotSequence,
          lyricCount: snapshot.lyrics?.length ?? 0
        })
      } else if (playerBridge.getState && playerBridge.getLyric) {
        const state = await playerBridge.getState()

        snapshotSong =
          state.currentSong ??
          (typeof playerBridge.getCurrentSong === 'function'
            ? await playerBridge.getCurrentSong()
            : null)
        snapshotIndex = state.currentLyricIndex ?? -1
        snapshotProgress = state.progress ?? 0
        snapshotPlaying = state.isPlaying ?? false

        if (snapshotSong) {
          snapshotLyrics = await playerBridge.getLyric(snapshotSong.id, snapshotSong.platform)
        }

        logDesktopLyricDebug('fallback', 'hydrate-player-state-fallback', {
          songId: snapshotSong?.id ?? null,
          platform: snapshotSong?.platform ?? null,
          currentTime: snapshotProgress,
          currentLyricIndex: snapshotIndex,
          sequence: 0,
          lyricCount: snapshotLyrics.length
        })
      }

      if (nextHydrationVersion !== hydrationVersion) {
        return
      }

      lastAcceptedSequence = snapshotSequence
      ipcLyricIndex.value = snapshotIndex
      ipcProgress.value = snapshotProgress
      ipcIsPlaying.value = snapshotPlaying
      currentSong.value = snapshotSong

      if (!snapshotSong) {
        cachedLyrics.value = []
        resetCurrentLine()
        logDesktopLyricDebug(
          playerBridge.getDesktopLyricSnapshot ? 'snapshot' : 'fallback',
          'hydrate-empty',
          {
            currentTime: snapshotProgress,
            currentLyricIndex: snapshotIndex
          }
        )
        return
      }

      cachedLyrics.value = snapshotLyrics
      const currentLine = resolveCurrentLine(snapshotLyrics, snapshotIndex, snapshotProgress)
      setCurrentLine(currentLine)
      setDisplayLyricsFromLine(currentLine)
    } catch {
      // Fall back to push-based lyric updates when snapshot hydration is unavailable.
    }
  }

  onMounted(() => {
    if (!platformService.isElectron()) {
      return
    }

    const playerBridge = getPlayerBridge()
    void hydrateCurrentLyricFromPlayer()

    if (playerBridge?.onPlayStateChange) {
      unsubscribers.push(
        playerBridge.onPlayStateChange(data => {
          ipcIsPlaying.value = data.isPlaying
          ipcProgress.value = data.currentTime

          if (!currentSong.value || cachedLyrics.value.length === 0) {
            logDesktopLyricDebug('fallback', 'rehydrate-after-play-state', {
              songId: currentSong.value?.id ?? null,
              platform: currentSong.value?.platform ?? null,
              currentTime: data.currentTime,
              currentLyricIndex: ipcLyricIndex.value,
              sequence: lastAcceptedSequence
            })
            void hydrateCurrentLyricFromPlayer()
            return
          }

          if (Date.now() - lastLyricPushAt > RECENT_LYRIC_PUSH_GUARD_MS) {
            refreshDisplayFromCachedLyrics()
            logDesktopLyricDebug('fallback', 'refresh-from-play-state', {
              songId: currentSong.value?.id ?? null,
              platform: currentSong.value?.platform ?? null,
              currentTime: data.currentTime,
              currentLyricIndex: ipcLyricIndex.value,
              sequence: lastAcceptedSequence
            })
          }
        })
      )
    }

    if (playerBridge?.onSongChange) {
      unsubscribers.push(
        playerBridge.onSongChange(data => {
          currentSong.value = data.song
          cachedLyrics.value = []
          ipcLyricIndex.value = -1
          lastLyricPushAt = 0
          lastAcceptedSequence = 0
          resetCurrentLine()
          logDesktopLyricDebug('fallback', 'song-change-reset', {
            songId: data.song?.id ?? null,
            platform: data.song?.platform ?? null,
            currentTime: ipcProgress.value,
            currentLyricIndex: -1,
            sequence: 0
          })
          void hydrateCurrentLyricFromPlayer()
        })
      )
    }

    unsubscribers.push(
      platformService.on('lyric-time-update', data => {
        const payload = data as IpcLyricPayload
        const payloadSongId = payload.songId ?? null
        const payloadPlatform = payload.platform ?? null
        const payloadSequence = payload.sequence ?? 0

        if (
          currentSong.value &&
          payloadSongId != null &&
          !isSameSong(currentSong.value, payloadSongId, payloadPlatform)
        ) {
          logDesktopLyricDebug('push', 'ignore-push-song-mismatch', {
            songId: payloadSongId,
            platform: payloadPlatform,
            currentTime: payload.time ?? ipcProgress.value,
            currentLyricIndex: payload.index ?? -1,
            sequence: payloadSequence,
            cause: payload.cause ?? 'interval'
          })
          return
        }

        if (payloadSequence > 0 && payloadSequence <= lastAcceptedSequence) {
          logDesktopLyricDebug('push', 'ignore-out-of-order-push', {
            songId: payloadSongId,
            platform: payloadPlatform,
            currentTime: payload.time ?? ipcProgress.value,
            currentLyricIndex: payload.index ?? -1,
            sequence: payloadSequence,
            cause: payload.cause ?? 'interval',
            lastAcceptedSequence
          })
          return
        }

        hydrationVersion += 1
        lastLyricPushAt = Date.now()
        if (payloadSequence > 0) {
          lastAcceptedSequence = payloadSequence
        }
        logDesktopLyricDebug('push', 'apply-lyric-push', {
          songId: payloadSongId,
          platform: payloadPlatform,
          currentTime: payload.time ?? ipcProgress.value,
          currentLyricIndex: payload.index ?? -1,
          sequence: payloadSequence,
          cause: payload.cause ?? ('interval' as DesktopLyricUpdateCause)
        })
        ipcLyricIndex.value = payload.index ?? -1
        ipcProgress.value = payload.time ?? ipcProgress.value
        ipcLyricText.value = payload.text || emptyText
        ipcLyricTrans.value = payload.trans || ''
        ipcLyricRoma.value = payload.roma || payload.romalrc || ''

        const payloadLine = createLyricLineFromPayload(payload)
        const derivedLine =
          payloadLine ??
          resolveCurrentLine(
            cachedLyrics.value,
            payload.index ?? -1,
            payload.time ?? ipcProgress.value
          )

        setCurrentLine(derivedLine)
        if (!payload.text && !payload.trans && !payload.roma && !payload.romalrc) {
          setDisplayLyricsFromLine(derivedLine)
        }

        if (typeof payload.playing === 'boolean') {
          ipcIsPlaying.value = payload.playing
        }
      })
    )
  })

  onUnmounted(() => {
    while (unsubscribers.length > 0) {
      unsubscribers.pop()?.()
    }
  })

  const currentLyric = computed(() => ipcLyricText.value ?? emptyText)
  const currentTrans = computed(() => ipcLyricTrans.value)
  const currentRoma = computed(() => ipcLyricRoma.value)
  const secondaryLyric = computed(() => currentTrans.value || currentRoma.value)
  const showOriginal = computed(() => true)
  const showTrans = computed(() => true)
  const showRoma = computed(() => true)

  return {
    lyrics: computed<LyricLine[]>(() => cachedLyrics.value),
    currentLyricIndex: computed(() => ipcLyricIndex.value),
    currentLine: computed(() => ipcCurrentLine.value),
    currentLyric,
    currentTrans,
    currentRoma,
    secondaryLyric,
    isPlaying: computed(() => ipcIsPlaying.value),
    showOriginal,
    showTrans,
    showRoma
  }
}
