import { computed, onMounted, ref } from 'vue'

import { services } from '../services'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePlayerStore } from '../store/playerStore'
import { useToastStore } from '../store/toastStore'

export type HomeTab = 'lyric' | 'playlist'

const COMPACT_MODE_PREFERENCE_KEY = 'compactModeUserToggled'

export function useHomeShell() {
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  const platformService = services.platform()
  const storageService = services.storage()
  const activeTab = ref<HomeTab>('lyric')

  useKeyboardShortcuts()

  const isElectron = computed(() => platformService.isElectron())

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
    platformService.minimizeWindow()
  }

  function maximizeWindow(): void {
    platformService.maximizeWindow()
  }

  function closeWindow(): void {
    platformService.closeWindow()
  }

  function isMobile(): boolean {
    return platformService.isMobile()
  }

  const userPreferenceSet = storageService.getItem(COMPACT_MODE_PREFERENCE_KEY)
  if (isMobile() && !playerStore.isCompact && !userPreferenceSet) {
    playerStore.isCompact = true
    storageService.setItem(COMPACT_MODE_PREFERENCE_KEY, 'true')
  }

  onMounted(() => {
    if (isElectron.value && !playerStore.ipcInitialized) {
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
