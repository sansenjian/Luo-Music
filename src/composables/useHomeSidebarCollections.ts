import { computed, ref, watch } from 'vue'

import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import {
  createAlbumCollectionSelection,
  createPlaylistCollectionSelection
} from '@/composables/home/homeCollectionSelection'
import { useUserPlaylists } from '@/composables/useUserPlaylists'
import { useUserStore } from '@/store/userStore'

import type {
  HomeSidebarCollectionSelection,
  HomeSidebarCollectionTone,
  HomeSidebarPlaylistFilter
} from '@/components/home/homeSidebar.types'

const COLLECTION_TONES: HomeSidebarCollectionTone[] = ['mono', 'violet', 'mist', 'ocean']

export function useHomeSidebarCollections() {
  const activePlaylistFilter = ref<HomeSidebarPlaylistFilter>('created')
  const userStore = useUserStore()
  const {
    createdPlaylists,
    favoritePlaylists,
    loading: playlistsLoading,
    loadPlaylists,
    resetPlaylists
  } = useUserPlaylists()
  const {
    albums: favoriteAlbums,
    loading: favoriteAlbumsLoading,
    loadFavoriteAlbums,
    resetFavoriteAlbums
  } = useFavoriteAlbums()

  const visibleCollections = computed<HomeSidebarCollectionSelection[]>(() =>
    activePlaylistFilter.value === 'created'
      ? createdPlaylists.value.map(createPlaylistCollectionSelection)
      : [
          ...favoritePlaylists.value.map(createPlaylistCollectionSelection),
          ...favoriteAlbums.value.map(createAlbumCollectionSelection)
        ]
  )
  const loading = computed(() =>
    activePlaylistFilter.value === 'created'
      ? playlistsLoading.value
      : playlistsLoading.value || favoriteAlbumsLoading.value
  )
  const emptyMessage = computed(() => {
    if (!userStore.isLoggedIn) {
      return '登录后查看歌单'
    }

    if (loading.value) {
      return activePlaylistFilter.value === 'created' ? '歌单加载中...' : '收藏加载中...'
    }

    return activePlaylistFilter.value === 'created' ? '暂无我的歌单' : '暂无收藏歌单'
  })

  watch(
    () => [userStore.isLoggedIn, userStore.userId] as const,
    ([isLoggedIn, userId]) => {
      if (isLoggedIn && userId !== null && userId !== undefined && userId !== '') {
        void loadPlaylists(userId)
        void loadFavoriteAlbums(userId)
        return
      }

      resetPlaylists()
      resetFavoriteAlbums()
    },
    { immediate: true }
  )

  function selectPlaylistFilter(filter: HomeSidebarPlaylistFilter): void {
    activePlaylistFilter.value = filter
  }

  function resolveCollectionCoverLabel(item: HomeSidebarCollectionSelection): string {
    return item.name.trim().charAt(0).toUpperCase() || '歌'
  }

  function resolveCollectionTone(collectionId: string): HomeSidebarCollectionTone {
    let hash = 5381

    for (const character of collectionId) {
      hash = ((hash << 5) + hash) ^ character.charCodeAt(0)
    }

    return COLLECTION_TONES[Math.abs(hash) % COLLECTION_TONES.length]
  }

  return {
    activePlaylistFilter,
    emptyMessage,
    loading,
    selectPlaylistFilter,
    resolveCollectionCoverLabel,
    resolveCollectionTone,
    visibleCollections
  }
}
