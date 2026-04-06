import { computed, onMounted, ref } from 'vue'

import { services } from '../services'
import type { PlatformService } from '../services/platformService'
import type { StorageService } from '../services/storageService'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePlayerStore } from '../store/playerStore'
import { useToastStore } from '../store/toastStore'

export type HomeTab = 'lyric' | 'playlist'

const COMPACT_MODE_PREFERENCE_KEY = 'compactModeUserToggled'

export type HomeShellDeps = {
  playerStore?: ReturnType<typeof usePlayerStore>
  toastStore?: Pick<ReturnType<typeof useToastStore>, 'error'>
  platformService?: Pick<
    PlatformService,
    'isElectron' | 'minimizeWindow' | 'maximizeWindow' | 'closeWindow' | 'isMobile'
  >
  storageService?: Pick<StorageService, 'getItem' | 'setItem'>
  registerKeyboardShortcuts?: () => void
}

export function useHomeShell(deps: HomeShellDeps = {}) {
  const playerStore = deps.playerStore ?? usePlayerStore()
  const toastStore = deps.toastStore ?? useToastStore()
  const platformService = deps.platformService ?? services.platform()
  const storageService = deps.storageService ?? services.storage()
  const activeTab = ref<HomeTab>('lyric')

  ;(deps.registerKeyboardShortcuts ?? useKeyboardShortcuts)()

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
