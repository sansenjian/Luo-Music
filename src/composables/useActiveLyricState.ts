import { computed } from 'vue'

import { usePlayerStore } from '../store/playerStore'
import type { LyricLine } from '../utils/player/core/lyric'
import { useIpcActiveLyricState } from './useIpcActiveLyricState'

export type LyricStateSource = 'store' | 'ipc'

export interface UseActiveLyricStateOptions {
  source?: LyricStateSource
  emptyText?: string
}

/**
 * Finds the index of the last lyric line whose timestamp is less than or equal to the provided playback time.
 *
 * @param lyrics - Sorted array of lyric lines (ascending `time`).
 * @param currentTime - Current playback time to resolve against the lyric timestamps.
 * @returns The greatest index `i` such that `lyrics[i].time <= currentTime`, or `-1` if no such index exists.
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
 * Provides reactive state for the currently active lyric lines and display flags.
 *
 * @param options - Configuration for the composer
 * @param options.source - Source of lyric state; when set to `'ipc'` this function delegates to the IPC-backed state and returns its result immediately. Defaults to `'store'`.
 * @param options.emptyText - Text to use when there is no current original lyric line. Defaults to `''`.
 * @returns An object of computed properties:
 * - `lyrics`: the full array of lyric lines
 * - `currentLyricIndex`: index of the active lyric line, or `-1` if none
 * - `currentLine`: the active `LyricLine` or `null` if out of range
 * - `currentLyric`: text of the active original lyric or `emptyText` when absent
 * - `currentTrans`: translation text of the active line or an empty string
 * - `currentRoma`: romanization text of the active line or an empty string
 * - `secondaryLyric`: prefers translation over romanization (translation if present, otherwise romanization)
 * - `isPlaying`: `true` when playback is active, `false` otherwise
 * - `showOriginal`: `true` when original lyrics should be shown
 * - `showTrans`: `true` when translations should be shown
 * - `showRoma`: `true` when romanizations should be shown
 */
export function useActiveLyricState(options: UseActiveLyricStateOptions = {}) {
  const { source = 'store', emptyText = '' } = options
  if (source === 'ipc') {
    return useIpcActiveLyricState(emptyText)
  }

  const playerStore = usePlayerStore()

  const lyrics = computed<LyricLine[]>(() => playerStore.lyricsArray)
  const currentLyricIndex = computed(() => {
    if (playerStore.currentLyricIndex >= 0) {
      return playerStore.currentLyricIndex
    }

    return resolveLyricIndexByTime(playerStore.lyricsArray, playerStore.progress)
  })
  const currentLine = computed<LyricLine | null>(() => {
    const index = currentLyricIndex.value
    if (index < 0 || index >= lyrics.value.length) {
      return null
    }

    return lyrics.value[index] ?? null
  })

  const currentLyric = computed(() => currentLine.value?.text || emptyText)
  const currentTrans = computed(() => currentLine.value?.trans || '')
  const currentRoma = computed(() => currentLine.value?.roma || '')
  const secondaryLyric = computed(() => currentTrans.value || currentRoma.value)
  const isPlaying = computed(() => playerStore.playing)
  const showOriginal = computed(() => playerStore.lyricType.includes('original'))
  const showTrans = computed(() => playerStore.lyricType.includes('trans'))
  const showRoma = computed(() => playerStore.lyricType.includes('roma'))

  return {
    lyrics,
    currentLyricIndex,
    currentLine,
    currentLyric,
    currentTrans,
    currentRoma,
    secondaryLyric,
    isPlaying,
    showOriginal,
    showTrans,
    showRoma
  }
}
