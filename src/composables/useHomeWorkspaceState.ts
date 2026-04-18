import { computed, ref } from 'vue'

import type { HomeSidebarCollectionSelection } from '@/components/home/homeSidebar.types'

export type HomeWorkspaceView = 'home' | 'liked' | 'collection' | 'local' | 'settings' | 'history'

export function useHomeWorkspaceState() {
  const activeWorkspaceView = ref<HomeWorkspaceView>('home')
  const selectedCollection = ref<HomeSidebarCollectionSelection | null>(null)

  const activeSidebarItemId = computed(() =>
    activeWorkspaceView.value === 'liked'
      ? 'liked'
      : activeWorkspaceView.value === 'local'
        ? 'local'
        : activeWorkspaceView.value === 'history'
          ? 'history'
          : activeWorkspaceView.value === 'settings'
            ? 'settings'
            : activeWorkspaceView.value === 'collection' && selectedCollection.value
              ? selectedCollection.value.uiId
              : 'home'
  )

  function handleSidebarItemSelect(itemId: string): void {
    if (itemId === 'liked') {
      activeWorkspaceView.value = 'liked'
      selectedCollection.value = null
      return
    }

    if (itemId === 'local') {
      activeWorkspaceView.value = 'local'
      selectedCollection.value = null
      return
    }

    if (itemId === 'history') {
      activeWorkspaceView.value = 'history'
      selectedCollection.value = null
      return
    }

    if (itemId === 'settings') {
      activeWorkspaceView.value = 'settings'
      selectedCollection.value = null
      return
    }

    activeWorkspaceView.value = 'home'
    selectedCollection.value = null
  }

  function handleSidebarCollectionSelect(selection: HomeSidebarCollectionSelection): void {
    selectedCollection.value = selection
    activeWorkspaceView.value = 'collection'
  }

  return {
    activeSidebarItemId,
    activeWorkspaceView,
    handleSidebarCollectionSelect,
    handleSidebarItemSelect,
    selectedCollection
  }
}
