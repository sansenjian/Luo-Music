import { computed, onMounted, ref } from 'vue'

import platform from '../platform'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePlayerStore } from '../store/playerStore'
import { useToastStore } from '../store/toastStore'

export type HomeTab = 'lyric' | 'playlist'

const COMPACT_MODE_PREFERENCE_KEY = 'compactModeUserToggled'

export function useHomeShell() {
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  const activeTab = ref<HomeTab>('lyric')

  useKeyboardShortcuts()

  const isElectron = computed(() => platform.isElectron())

  function switchTab(tab: HomeTab): void {
    activeTab.value = tab
  }

  async function playSong(index: number): Promise<void> {
    try {
      await playerStore.playSongWithDetails(index)
      activeTab.value = 'lyric'
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback failed. Please try again.'
      toastStore.error(message)
    }
  }

  function minimizeWindow(): void {
    platform.minimizeWindow()
  }

  function maximizeWindow(): void {
    platform.maximizeWindow()
  }

  function closeWindow(): void {
    platform.closeWindow()
  }

  function isMobile(): boolean {
    return platform.isMobile()
  }

  onMounted(() => {
    const userPreferenceSet = localStorage.getItem(COMPACT_MODE_PREFERENCE_KEY)
    if (isMobile() && !playerStore.isCompact && !userPreferenceSet) {
      playerStore.toggleCompactMode()
    }

    if (isElectron.value) {
      playerStore.setupIpcListeners()
    }
  })

  return {
    activeTab,
    closeWindow,
    isElectron,
    maximizeWindow,
    minimizeWindow,
    playSong,
    playerStore,
    switchTab
  }
}
