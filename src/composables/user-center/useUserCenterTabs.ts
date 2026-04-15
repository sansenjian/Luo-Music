import { nextTick, watch, type Ref } from 'vue'

import {
  createLoadedTabs,
  createLoadingMap,
  createMountedTabs,
  parseQueryValue,
  parseUserTab,
  type UserTab,
  type UserTabStateMap
} from './shared'
import type {
  UserCenterEventsLike,
  UserCenterFavoriteAlbumsLike,
  UserCenterLikedSongsLike,
  UserCenterPlaylistsLike,
  UserCenterRouteLike,
  UserCenterRouterLike,
  UserStoreLike
} from './types'

export interface UseUserCenterTabsOptions {
  route: UserCenterRouteLike
  router: UserCenterRouterLike
  userStore: Pick<UserStoreLike, 'isLoggedIn' | 'userId'>
  activeTab: Ref<UserTab>
  loadingMap: Ref<UserTabStateMap>
  mountedTabs: Ref<UserTabStateMap>
  loadedTabs: Ref<UserTabStateMap>
  loadLikedSongs: UserCenterLikedSongsLike['loadLikedSongs']
  retryLoadLikedSongs: UserCenterLikedSongsLike['retryLoadLikedSongs']
  resetLikedSongs: UserCenterLikedSongsLike['resetLikedSongs']
  loadPlaylists: UserCenterPlaylistsLike['loadPlaylists']
  resetPlaylists: UserCenterPlaylistsLike['resetPlaylists']
  loadFavoriteAlbums: UserCenterFavoriteAlbumsLike['loadFavoriteAlbums']
  resetFavoriteAlbums: UserCenterFavoriteAlbumsLike['resetFavoriteAlbums']
  loadEvents: UserCenterEventsLike['loadEvents']
  retryLoadEvents: UserCenterEventsLike['retryLoadEvents']
  resetEvents: UserCenterEventsLike['resetEvents']
  selectedPlaylistId: Ref<string | null>
  selectedAlbumId: Ref<string | null>
  resetPlaylistDetail: () => void
  resetAlbumDetail: () => void
  resetDetailState: () => void
  loadPlaylistDetail: (playlistId: string | number, force?: boolean) => Promise<unknown>
  loadAlbumDetail: (albumId: string | number, force?: boolean) => Promise<unknown>
}

export interface UseUserCenterTabsReturn {
  syncRouteQuery: () => void
  resetUserContent: () => void
  loadTabData: (tab: UserTab, userId: string | number, force?: boolean) => Promise<void>
  switchTab: (tab: UserTab) => void
  retryActiveTab: () => Promise<void>
  goBack: () => void
}

export function useUserCenterTabs(options: UseUserCenterTabsOptions): UseUserCenterTabsReturn {
  const {
    activeTab,
    loadedTabs,
    loadingMap,
    loadAlbumDetail,
    loadEvents,
    loadFavoriteAlbums,
    loadLikedSongs,
    loadPlaylists,
    loadPlaylistDetail,
    mountedTabs,
    resetAlbumDetail,
    resetDetailState,
    resetEvents,
    resetFavoriteAlbums,
    resetLikedSongs,
    resetPlaylists,
    resetPlaylistDetail,
    retryLoadEvents,
    retryLoadLikedSongs,
    route,
    router,
    selectedAlbumId,
    selectedPlaylistId,
    userStore
  } = options

  let activeLoadId = 0

  const syncRouteQuery = (): void => {
    const nextQuery: Record<string, string> = {
      tab: activeTab.value
    }

    if (activeTab.value === 'playlist' && selectedPlaylistId.value) {
      nextQuery.playlistId = selectedPlaylistId.value
    }

    if (activeTab.value === 'album' && selectedAlbumId.value) {
      nextQuery.albumId = selectedAlbumId.value
    }

    const currentTab = parseUserTab(route.query.tab)
    const currentPlaylistId =
      currentTab === 'playlist' ? parseQueryValue(route.query.playlistId) : null
    const currentAlbumId = currentTab === 'album' ? parseQueryValue(route.query.albumId) : null

    if (
      currentTab === nextQuery.tab &&
      currentPlaylistId === (nextQuery.playlistId ?? null) &&
      currentAlbumId === (nextQuery.albumId ?? null)
    ) {
      return
    }

    void router.replace({
      path: '/user',
      query: nextQuery
    })
  }

  const resetUserContent = (): void => {
    activeLoadId += 1
    activeTab.value = parseUserTab(route.query.tab)
    mountedTabs.value = createMountedTabs(activeTab.value)
    loadedTabs.value = createLoadedTabs()
    loadingMap.value = createLoadingMap()
    resetDetailState()
    resetLikedSongs()
    resetPlaylists()
    resetFavoriteAlbums()
    resetEvents()
  }

  const loadTabData = async (
    tab: UserTab,
    userId: string | number,
    force = false
  ): Promise<void> => {
    if (!force && (loadedTabs.value[tab] || loadingMap.value[tab])) {
      return
    }

    const loadId = activeLoadId
    loadingMap.value[tab] = true

    try {
      if (tab === 'liked') {
        await loadLikedSongs(userId)
      } else if (tab === 'playlist') {
        await loadPlaylists(userId)
      } else if (tab === 'album') {
        await Promise.all([
          loadedTabs.value.playlist || loadingMap.value.playlist
            ? Promise.resolve()
            : loadPlaylists(userId),
          loadFavoriteAlbums(userId)
        ])
      } else {
        await loadEvents(userId)
      }

      if (loadId === activeLoadId) {
        loadedTabs.value[tab] = true
      }
    } finally {
      if (loadId === activeLoadId) {
        loadingMap.value[tab] = false
      }
    }
  }

  const goBack = (): void => {
    void router.push('/')
  }

  const switchTab = (tab: UserTab): void => {
    mountedTabs.value[tab] = true
    activeTab.value = tab
    if (tab !== 'playlist') {
      resetPlaylistDetail()
    }
    if (tab !== 'album') {
      resetAlbumDetail()
    }
    syncRouteQuery()

    const userId = userStore.userId
    if (!userStore.isLoggedIn || !userId) {
      return
    }

    void loadTabData(tab, userId)
  }

  const retryActiveTab = async (): Promise<void> => {
    const userId = userStore.userId
    if (!userStore.isLoggedIn || !userId) {
      return
    }

    if (activeTab.value === 'liked') {
      await retryLoadLikedSongs()
      return
    }

    if (activeTab.value === 'events') {
      await retryLoadEvents()
      return
    }

    await loadTabData(activeTab.value, userId, true)
  }

  watch(
    () => [route.query.tab, route.query.playlistId, route.query.albumId] as const,
    ([queryTab, queryPlaylistId, queryAlbumId]) => {
      const nextTab = parseUserTab(queryTab)
      const nextPlaylistId = nextTab === 'playlist' ? parseQueryValue(queryPlaylistId) : null
      const nextAlbumId = nextTab === 'album' ? parseQueryValue(queryAlbumId) : null

      if (activeTab.value !== nextTab) {
        activeTab.value = nextTab
        mountedTabs.value[nextTab] = true

        const userId = userStore.userId
        if (userStore.isLoggedIn && userId) {
          void loadTabData(nextTab, userId)
        }
      }

      if (selectedPlaylistId.value !== nextPlaylistId) {
        if (!nextPlaylistId) {
          resetPlaylistDetail()
        } else {
          selectedPlaylistId.value = nextPlaylistId
          void loadPlaylistDetail(nextPlaylistId)
        }
      }

      if (selectedAlbumId.value === nextAlbumId) {
        return
      }

      if (!nextAlbumId) {
        resetAlbumDetail()
        return
      }

      selectedAlbumId.value = nextAlbumId
      void loadAlbumDetail(nextAlbumId)
    }
  )

  watch(
    () => [userStore.isLoggedIn, userStore.userId] as const,
    async ([isLoggedIn, userId]) => {
      resetUserContent()
      await nextTick()

      if (!isLoggedIn || !userId) {
        goBack()
        return
      }

      await loadTabData(activeTab.value, userId, true)

      if (activeTab.value === 'playlist' && selectedPlaylistId.value) {
        await loadPlaylistDetail(selectedPlaylistId.value, true)
      } else if (activeTab.value === 'album' && selectedAlbumId.value) {
        await loadAlbumDetail(selectedAlbumId.value, true)
      }
    },
    { immediate: true }
  )

  return {
    syncRouteQuery,
    resetUserContent,
    loadTabData,
    switchTab,
    retryActiveTab,
    goBack
  }
}
