import { computed, onMounted, onUnmounted, ref } from 'vue'

import { services } from '../services'
import { usePlayerStore } from '../store/playerStore'
import type { LyricLine } from '../utils/player/core/lyric'

export type LyricStateSource = 'store' | 'ipc'

export interface UseActiveLyricStateOptions {
  source?: LyricStateSource
  emptyText?: string
}

interface IpcLyricPayload {
  index?: number
  text?: string
  trans?: string
  roma?: string
  romalrc?: string
  playing?: boolean
}

export function useActiveLyricState(options: UseActiveLyricStateOptions = {}) {
  const { source = 'store', emptyText = '' } = options
  const playerStore = source === 'store' ? usePlayerStore() : null
  const platformService = services.platform()

  const ipcLyricIndex = ref(-1)
  const ipcLyricText = ref(emptyText)
  const ipcLyricTrans = ref('')
  const ipcLyricRoma = ref('')
  const ipcIsPlaying = ref(false)
  const unsubscribers: Array<() => void> = []

  const lyrics = computed<LyricLine[]>(() => playerStore?.lyricsArray ?? [])
  const currentLyricIndex = computed(() =>
    source === 'store' ? (playerStore?.currentLyricIndex ?? -1) : ipcLyricIndex.value
  )
  const currentLine = computed<LyricLine | null>(() => {
    if (source !== 'store') {
      return null
    }

    const index = currentLyricIndex.value
    if (index < 0 || index >= lyrics.value.length) {
      return null
    }

    return lyrics.value[index] ?? null
  })

  const currentLyric = computed(() =>
    source === 'store' ? currentLine.value?.text || emptyText : ipcLyricText.value || emptyText
  )
  const currentTrans = computed(() =>
    source === 'store' ? currentLine.value?.trans || '' : ipcLyricTrans.value
  )
  const currentRoma = computed(() =>
    source === 'store' ? currentLine.value?.roma || '' : ipcLyricRoma.value
  )
  const secondaryLyric = computed(() => currentTrans.value || currentRoma.value)
  const isPlaying = computed(() =>
    source === 'store' ? (playerStore?.playing ?? false) : ipcIsPlaying.value
  )

  const showOriginal = computed(() =>
    playerStore ? playerStore.lyricType.includes('original') : true
  )
  const showTrans = computed(() => (playerStore ? playerStore.lyricType.includes('trans') : true))
  const showRoma = computed(() => (playerStore ? playerStore.lyricType.includes('roma') : true))

  onMounted(() => {
    if (source !== 'ipc' || !platformService.isElectron()) {
      return
    }

    unsubscribers.push(
      platformService.on('lyric-time-update', data => {
        const payload = data as IpcLyricPayload
        ipcLyricIndex.value = payload.index ?? -1
        ipcLyricText.value = payload.text || emptyText
        ipcLyricTrans.value = payload.trans || ''
        ipcLyricRoma.value = payload.roma || payload.romalrc || ''
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
