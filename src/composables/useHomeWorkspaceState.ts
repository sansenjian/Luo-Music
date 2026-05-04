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

type WorkspaceSnapshot = {
  view: HomeWorkspaceView
  collection: HomeSidebarCollectionSelection | null
}

export function useHomeWorkspaceState() {
  const activeWorkspaceView = ref<HomeWorkspaceView>('home')
  const selectedCollection = ref<HomeSidebarCollectionSelection | null>(null)
  const backStack = ref<WorkspaceSnapshot[]>([])
  const forwardStack = ref<WorkspaceSnapshot[]>([])

  const currentSnapshot = computed<WorkspaceSnapshot>(() => ({
    view: activeWorkspaceView.value,
    collection: selectedCollection.value
  }))

  const canNavigateBack = computed(() => backStack.value.length > 0)
  const canNavigateForward = computed(() => forwardStack.value.length > 0)

  const activeSidebarItemId = computed<string | null>(() => {
    if (activeWorkspaceView.value === 'collection' && selectedCollection.value) {
      return selectedCollection.value.uiId
    }
    return VIEW_TO_SIDEBAR_ITEM[activeWorkspaceView.value]
  })

  function isSameSnapshot(a: WorkspaceSnapshot, b: WorkspaceSnapshot): boolean {
    return a.view === b.view && a.collection?.uiId === b.collection?.uiId
  }

  function applySnapshot(snapshot: WorkspaceSnapshot): void {
    activeWorkspaceView.value = snapshot.view
    selectedCollection.value = snapshot.collection
  }

  function pushHistoryBeforeNavigation(nextSnapshot: WorkspaceSnapshot): void {
    const previousSnapshot = currentSnapshot.value
    if (isSameSnapshot(previousSnapshot, nextSnapshot)) {
      return
    }

    backStack.value.push(previousSnapshot)
    forwardStack.value = []
  }

  function handleSidebarItemSelect(itemId: string): void {
    const view = SIDEBAR_ITEM_TO_VIEW[itemId]
    const nextSnapshot: WorkspaceSnapshot = {
      view: view ?? 'home',
      collection: null
    }

    pushHistoryBeforeNavigation(nextSnapshot)
    applySnapshot(nextSnapshot)
  }

  function handleSidebarCollectionSelect(selection: HomeSidebarCollectionSelection): void {
    const nextSnapshot: WorkspaceSnapshot = {
      view: 'collection',
      collection: selection
    }

    pushHistoryBeforeNavigation(nextSnapshot)
    applySnapshot(nextSnapshot)
  }

  function resetToHome(): void {
    const nextSnapshot: WorkspaceSnapshot = {
      view: 'home',
      collection: null
    }

    pushHistoryBeforeNavigation(nextSnapshot)
    applySnapshot(nextSnapshot)
  }

  function showNowPlaying(): void {
    const nextSnapshot: WorkspaceSnapshot = {
      view: 'now-playing',
      collection: null
    }

    pushHistoryBeforeNavigation(nextSnapshot)
    applySnapshot(nextSnapshot)
  }

  function navigateBack(): void {
    const previousSnapshot = backStack.value.pop()
    if (!previousSnapshot) {
      return
    }

    forwardStack.value.push(currentSnapshot.value)
    applySnapshot(previousSnapshot)
  }

  function navigateForward(): void {
    const nextSnapshot = forwardStack.value.pop()
    if (!nextSnapshot) {
      return
    }

    backStack.value.push(currentSnapshot.value)
    applySnapshot(nextSnapshot)
  }

  return {
    activeSidebarItemId,
    activeWorkspaceView,
    canNavigateBack,
    canNavigateForward,
    handleSidebarCollectionSelect,
    handleSidebarItemSelect,
    navigateBack,
    navigateForward,
    resetToHome,
    showNowPlaying,
    selectedCollection
  }
}
