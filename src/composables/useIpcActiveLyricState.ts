import { computed, onMounted, onUnmounted, ref } from 'vue'

import { services } from '../services'
import type { Song } from '../types/schemas'
import type { LyricLine } from '../utils/player/core/lyric'
import type { DesktopLyricSnapshot, LyricTimeUpdate } from '../../electron/ipc/types'

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
  onPlayStateChange?: (listener: (data: { isPlaying: boolean; currentTime: number }) => void) => () => void
  onSongChange?: (listener: (data: { song: Song | null; index: number }) => void) => () => void
}

function getPlayerBridge(): PlayerBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window).services?.player
}

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
    ipcLyricText.value = line?.text || emptyText
    ipcLyricTrans.value = line?.trans || ''
    ipcLyricRoma.value = line?.roma || ''
  }

  function resolveCurrentLine(lyrics: LyricLine[], index: number, progress: number): LyricLine | null {
    if (index >= 0) {
      return lyrics[index] ?? null
    }

    const resolvedIndex = resolveLyricIndexByTime(lyrics, progress)
    return resolvedIndex >= 0 ? (lyrics[resolvedIndex] ?? null) : null
  }

  function refreshDisplayFromCachedLyrics() {
    const line = resolveCurrentLine(cachedLyrics.value, ipcLyricIndex.value, ipcProgress.value)
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

      if (playerBridge.getDesktopLyricSnapshot) {
        const snapshot = await playerBridge.getDesktopLyricSnapshot()
        snapshotSong = snapshot.currentSong
        snapshotLyrics = snapshot.lyrics ?? []
        snapshotIndex = snapshot.currentLyricIndex ?? -1
        snapshotProgress = snapshot.progress ?? 0
        snapshotPlaying = snapshot.isPlaying ?? false
        lastAcceptedSequence = snapshot.sequence ?? 0
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
        lastAcceptedSequence = 0

        if (snapshotSong) {
          snapshotLyrics = await playerBridge.getLyric(snapshotSong.id, snapshotSong.platform)
        }
      }

      if (nextHydrationVersion !== hydrationVersion) {
        return
      }

      ipcLyricIndex.value = snapshotIndex
      ipcProgress.value = snapshotProgress
      ipcIsPlaying.value = snapshotPlaying
      currentSong.value = snapshotSong

      if (!snapshotSong) {
        cachedLyrics.value = []
        resetCurrentLine()
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
            void hydrateCurrentLyricFromPlayer()
            return
          }

          if (Date.now() - lastLyricPushAt > RECENT_LYRIC_PUSH_GUARD_MS) {
            refreshDisplayFromCachedLyrics()
          }
        })
      )
    }

    if (playerBridge?.onSongChange) {
      unsubscribers.push(
        playerBridge.onSongChange(data => {
          currentSong.value = data.song
          cachedLyrics.value = []
          lastLyricPushAt = 0
          lastAcceptedSequence = 0
          resetCurrentLine()
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
          return
        }

        if (payloadSequence > 0 && payloadSequence <= lastAcceptedSequence) {
          return
        }

        hydrationVersion += 1
        lastLyricPushAt = Date.now()
        if (payloadSequence > 0) {
          lastAcceptedSequence = payloadSequence
        }
        ipcLyricIndex.value = payload.index ?? -1
        ipcProgress.value = payload.time ?? ipcProgress.value
        ipcLyricText.value = payload.text || emptyText
        ipcLyricTrans.value = payload.trans || ''
        ipcLyricRoma.value = payload.roma || payload.romalrc || ''

        const payloadLine = createLyricLineFromPayload(payload)
        const derivedLine =
          payloadLine ??
          resolveCurrentLine(cachedLyrics.value, payload.index ?? -1, payload.time ?? ipcProgress.value)

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

  const currentLyric = computed(() => ipcLyricText.value || emptyText)
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
