import { computed, onMounted, onUnmounted, ref } from 'vue'

import { services } from '../services'
import { usePlayerStore } from '../store/playerStore'
import type { Song } from '../types/schemas'
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

interface PlayerStateSnapshot {
  isPlaying: boolean
  currentIndex: number
  currentSong: Song | null
  currentLyricIndex: number
}

interface PlayerBridge {
  getState?: () => Promise<PlayerStateSnapshot>
  getCurrentSong?: () => Promise<Song | null>
  getLyric?: (songId: string | number, platform?: 'netease' | 'qq') => Promise<LyricLine[]>
}

function getPlayerBridge(): PlayerBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window).services?.player
}

export function useActiveLyricState(options: UseActiveLyricStateOptions = {}) {
  const { source = 'store', emptyText = '' } = options
  const playerStore = source === 'store' ? usePlayerStore() : null
  const platformService = services.platform()

  const ipcLyricIndex = ref(-1)
  const ipcLyricText = ref(emptyText)
  const ipcLyricTrans = ref('')
  const ipcLyricRoma = ref('')
  const ipcCurrentLine = ref<LyricLine | null>(null)
  const ipcIsPlaying = ref(false)
  const unsubscribers: Array<() => void> = []
  let ipcHydrationVersion = 0

  const lyrics = computed<LyricLine[]>(() => playerStore?.lyricsArray ?? [])
  const currentLyricIndex = computed(() =>
    source === 'store' ? (playerStore?.currentLyricIndex ?? -1) : ipcLyricIndex.value
  )
  const currentLine = computed<LyricLine | null>(() => {
    if (source === 'ipc') {
      return ipcCurrentLine.value
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

  async function hydrateCurrentLyricFromPlayer(): Promise<void> {
    const playerBridge = getPlayerBridge()
    if (
      source !== 'ipc' ||
      !platformService.isElectron() ||
      !playerBridge?.getState ||
      !playerBridge.getLyric
    ) {
      return
    }

    try {
      const hydrationVersion = ++ipcHydrationVersion
      const state = await playerBridge.getState()

      const currentSong =
        state.currentSong ??
        (typeof playerBridge.getCurrentSong === 'function'
          ? await playerBridge.getCurrentSong()
          : null)

      if (hydrationVersion !== ipcHydrationVersion) {
        return
      }

      ipcLyricIndex.value = state.currentLyricIndex ?? -1
      ipcIsPlaying.value = state.isPlaying ?? false

      if (!currentSong || state.currentLyricIndex < 0) {
        ipcCurrentLine.value = null
        ipcLyricText.value = emptyText
        ipcLyricTrans.value = ''
        ipcLyricRoma.value = ''
        return
      }

      const lyrics = await playerBridge.getLyric(currentSong.id, currentSong.platform)
      if (hydrationVersion !== ipcHydrationVersion) {
        return
      }

      const currentLine = lyrics[state.currentLyricIndex] ?? null
      if (!currentLine) {
        ipcCurrentLine.value = null
        ipcLyricText.value = emptyText
        ipcLyricTrans.value = ''
        ipcLyricRoma.value = ''
        return
      }

      ipcCurrentLine.value = currentLine
      ipcLyricText.value = currentLine.text || emptyText
      ipcLyricTrans.value = currentLine.trans || ''
      ipcLyricRoma.value = currentLine.roma || ''
    } catch {
      // Fall back to push-based lyric updates when the snapshot path is unavailable.
    }
  }

  onMounted(() => {
    if (source !== 'ipc' || !platformService.isElectron()) {
      return
    }

    void hydrateCurrentLyricFromPlayer()

    unsubscribers.push(
      platformService.on('lyric-time-update', data => {
        ipcHydrationVersion += 1
        const payload = data as IpcLyricPayload
        ipcLyricIndex.value = payload.index ?? -1
        ipcLyricText.value = payload.text || emptyText
        ipcLyricTrans.value = payload.trans || ''
        ipcLyricRoma.value = payload.roma || payload.romalrc || ''
        ipcCurrentLine.value =
          (payload.index ?? -1) >= 0
            ? {
                time: ipcCurrentLine.value?.time ?? 0,
                text: payload.text || '',
                trans: payload.trans || '',
                roma: payload.roma || payload.romalrc || ''
              }
            : null
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
