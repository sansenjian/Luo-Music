import { computed, ref } from 'vue'

import type { HomeSidebarCollectionSelection } from '@/components/home/homeSidebar.types'

export type HomeWorkspaceView =
  | 'home'
  | 'discover'
  | 'roaming'
  | 'liked'
  | 'collection'
  | 'local'
  | 'settings'
  | 'history'
  | 'plugins'
  | 'now-playing'

const SIDEBAR_ITEM_TO_VIEW: Record<string, HomeWorkspaceView> = {
  home: 'home',
  discover: 'discover',
  roaming: 'roaming',
  liked: 'liked',
  local: 'local',
  history: 'history',
  settings: 'settings',
  plugins: 'plugins'
}

const VIEW_TO_SIDEBAR_ITEM: Record<HomeWorkspaceView, string | null> = {
  home: 'home',
  discover: 'discover',
  roaming: 'roaming',
  liked: 'liked',
  local: 'local',
  history: 'history',
  settings: 'settings',
  plugins: 'plugins',
  collection: null,
  'now-playing': null
}

export function useHomeWorkspaceState() {
  const activeWorkspaceView = ref<HomeWorkspaceView>('home')
  const selectedCollection = ref<HomeSidebarCollectionSelection | null>(null)

  const activeSidebarItemId = computed<string | null>(() => {
    if (activeWorkspaceView.value === 'collection' && selectedCollection.value) {
      return selectedCollection.value.uiId
    }
    return VIEW_TO_SIDEBAR_ITEM[activeWorkspaceView.value]
  })

  function handleSidebarItemSelect(itemId: string): void {
    const view = SIDEBAR_ITEM_TO_VIEW[itemId]
    activeWorkspaceView.value = view ?? 'home'
    selectedCollection.value = null
  }

  function handleSidebarCollectionSelect(selection: HomeSidebarCollectionSelection): void {
    selectedCollection.value = selection
    activeWorkspaceView.value = 'collection'
  }

  function resetToHome(): void {
    activeWorkspaceView.value = 'home'
    selectedCollection.value = null
  }

  function showNowPlaying(): void {
    activeWorkspaceView.value = 'now-playing'
  }

  return {
    activeSidebarItemId,
    activeWorkspaceView,
    handleSidebarCollectionSelect,
    handleSidebarItemSelect,
    resetToHome,
    showNowPlaying,
    selectedCollection
  }
}
