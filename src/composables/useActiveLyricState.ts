import { computed } from 'vue'

import { usePlayerStore } from '../store/playerStore'
import type { LyricLine } from '../utils/player/core/lyric'
import { useIpcActiveLyricState } from './useIpcActiveLyricState'

export type LyricStateSource = 'store' | 'ipc'

export interface UseActiveLyricStateOptions {
  source?: LyricStateSource
  emptyText?: string
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
