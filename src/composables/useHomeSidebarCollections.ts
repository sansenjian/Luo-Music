import { computed, ref, watch } from 'vue'

import { useFavoriteAlbums, type FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import { useUserPlaylists, type PlaylistItem } from '@/composables/useUserPlaylists'
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
      ? createdPlaylists.value.map(mapPlaylistToCollectionItem)
      : [
          ...favoritePlaylists.value.map(mapPlaylistToCollectionItem),
          ...favoriteAlbums.value.map(mapAlbumToCollectionItem)
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
    let hash = 0

    for (const character of collectionId) {
      hash = (hash + character.charCodeAt(0)) % COLLECTION_TONES.length
    }

    return COLLECTION_TONES[hash]
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

function mapPlaylistToCollectionItem(playlist: PlaylistItem): HomeSidebarCollectionSelection {
  return {
    uiId: `playlist:${playlist.id}`,
    sourceId: playlist.id,
    kind: 'playlist',
    name: playlist.name,
    coverUrl: typeof playlist.coverImgUrl === 'string' ? playlist.coverImgUrl : '',
    summary: resolvePlaylistSummary(playlist)
  }
}

function mapAlbumToCollectionItem(album: FavoriteAlbumItem): HomeSidebarCollectionSelection {
  return {
    uiId: `album:${album.id}`,
    sourceId: album.id,
    kind: 'album',
    name: album.name,
    coverUrl: album.picUrl,
    summary: resolveAlbumSummary(album)
  }
}

function resolvePlaylistSummary(playlist: PlaylistItem): string {
  const trackCount = Number(playlist.trackCount)
  if (Number.isFinite(trackCount) && trackCount > 0) {
    return `${trackCount} 首歌`
  }

  return '歌单'
}

function resolveAlbumSummary(album: FavoriteAlbumItem): string {
  const size = Number(album.size)
  if (album.artistName && Number.isFinite(size) && size > 0) {
    return `${album.artistName} · ${size} 首歌`
  }

  if (album.artistName) {
    return album.artistName
  }

  if (Number.isFinite(size) && size > 0) {
    return `${size} 首歌`
  }

  return '收藏'
}
