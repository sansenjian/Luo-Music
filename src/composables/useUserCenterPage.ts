import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import { useLikedSongs } from '@/composables/useLikedSongs'
import { useUserEvents } from '@/composables/useUserEvents'
import { useUserPlaylists } from '@/composables/useUserPlaylists'
import {
  createLoadedTabs,
  createLoadingMap,
  createMountedTabs,
  parseUserTab,
  type UserTab,
  type UserTabStateMap
} from '@/composables/user-center/shared'
import { useUserCenterDetails } from '@/composables/user-center/useUserCenterDetails'
import { useUserCenterPlayback } from '@/composables/user-center/useUserCenterPlayback'
import { useUserCenterTabs } from '@/composables/user-center/useUserCenterTabs'
import type {
  PlayerStoreLike,
  PlaylistStoreLike,
  UserCenterEventsLike,
  UserCenterFavoriteAlbumsLike,
  UserCenterLikedSongsLike,
  UserCenterPlaylistsLike,
  UserCenterRouteLike,
  UserCenterRouterLike,
  UserStoreLike
} from '@/composables/user-center/types'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useUserStore } from '@/store/userStore'

export interface UseUserCenterPageDeps {
  route?: UserCenterRouteLike
  router?: UserCenterRouterLike
  userStore?: UserStoreLike
  playlistStore?: PlaylistStoreLike
  playerStore?: PlayerStoreLike
  likedSongs?: UserCenterLikedSongsLike
  userPlaylists?: UserCenterPlaylistsLike
  favoriteAlbums?: UserCenterFavoriteAlbumsLike
  userEvents?: UserCenterEventsLike
}

export interface UseUserCenterPageReturn {
  activeTab: Ref<UserTab>
  loadingMap: Ref<UserTabStateMap>
  mountedTabs: Ref<UserTabStateMap>
  loadedTabs: Ref<UserTabStateMap>
  currentUserId: ComputedRef<UserStoreLike['userId']>
  avatarUrl: ComputedRef<UserStoreLike['avatarUrl']>
  nickname: ComputedRef<UserStoreLike['nickname']>
  selectedPlaylistId: Ref<string | null>
  selectedPlaylist: ComputedRef<UserCenterPlaylistsLike['playlists']['value'][number] | null>
  selectedPlaylistSongs: Ref<Song[]>
  playlistDetailLoading: Ref<boolean>
  playlistDetailError: Ref<unknown>
  selectedAlbumId: Ref<string | null>
  selectedAlbum: ComputedRef<UserCenterFavoriteAlbumsLike['albums']['value'][number] | null>
  selectedAlbumSongs: Ref<Song[]>
  albumDetailLoading: Ref<boolean>
  albumDetailError: Ref<unknown>
  activeTabError: ComputedRef<unknown>
  likedCount: UserCenterLikedSongsLike['count']
  playlistCount: UserCenterPlaylistsLike['count']
  albumCount: ComputedRef<number>
  eventsCount: UserCenterEventsLike['count']
  tabCounts: ComputedRef<Record<UserTab, number>>
  likedSongsHasMore: UserCenterLikedSongsLike['hasMore']
  likedSongsLoadingMore: UserCenterLikedSongsLike['loadingMore']
  likedSongsError: UserCenterLikedSongsLike['error']
  likeSongs: UserCenterLikedSongsLike['likeSongs']
  formattedSongs: UserCenterLikedSongsLike['formattedSongs']
  loadLikedSongs: UserCenterLikedSongsLike['loadLikedSongs']
  loadMoreLikedSongs: UserCenterLikedSongsLike['loadMoreLikedSongs']
  retryLoadLikedSongs: UserCenterLikedSongsLike['retryLoadLikedSongs']
  resetLikedSongs: UserCenterLikedSongsLike['resetLikedSongs']
  playlists: UserCenterPlaylistsLike['createdPlaylists']
  favoritePlaylists: UserCenterPlaylistsLike['favoritePlaylists']
  loadPlaylists: UserCenterPlaylistsLike['loadPlaylists']
  loadPlaylistSongs: UserCenterPlaylistsLike['loadPlaylistSongs']
  resetPlaylists: UserCenterPlaylistsLike['resetPlaylists']
  albums: UserCenterFavoriteAlbumsLike['albums']
  loadFavoriteAlbums: UserCenterFavoriteAlbumsLike['loadFavoriteAlbums']
  loadAlbumSongs: UserCenterFavoriteAlbumsLike['loadAlbumSongs']
  resetFavoriteAlbums: UserCenterFavoriteAlbumsLike['resetFavoriteAlbums']
  eventsFilter: UserCenterEventsLike['activeFilter']
  setEventsFilter: UserCenterEventsLike['setFilter']
  events: UserCenterEventsLike['events']
  filteredEvents: UserCenterEventsLike['filteredEvents']
  eventsHasMore: UserCenterEventsLike['hasMore']
  eventsLoadingMore: UserCenterEventsLike['loadingMore']
  eventsError: UserCenterEventsLike['error']
  loadEvents: UserCenterEventsLike['loadEvents']
  loadMoreEvents: UserCenterEventsLike['loadMoreEvents']
  retryLoadEvents: UserCenterEventsLike['retryLoadEvents']
  resetEvents: UserCenterEventsLike['resetEvents']
  switchTab: (tab: UserTab) => void
  openPlaylistDetail: (playlistId: string | number) => Promise<void>
  closePlaylistDetail: () => void
  openAlbumDetail: (albumId: string | number) => Promise<void>
  closeAlbumDetail: () => void
  retryActiveTab: () => Promise<void>
  retryPlaylistDetail: () => Promise<void>
  retryAlbumDetail: () => Promise<void>
  resetUserContent: () => void
  loadTabData: (tab: UserTab, userId: string | number, force?: boolean) => Promise<void>
  playEventSong: (song: Song) => Promise<void>
  playPlaylist: (playlistId: string | number) => Promise<void>
  playPlaylistTrackAt: (index: number) => Promise<void>
  playAlbum: (albumId: string | number) => Promise<void>
  playAlbumTrackAt: (index: number) => Promise<void>
  playAllLikedSongs: () => Promise<void>
  playLikedSongAt: (index: number) => Promise<void>
  goBack: () => void
}

export function useUserCenterPage(deps: UseUserCenterPageDeps = {}): UseUserCenterPageReturn {
  const route = deps.route ?? useRoute()
  const router = deps.router ?? useRouter()
  const userStore = deps.userStore ?? useUserStore()
  const playlistStore = deps.playlistStore ?? usePlaylistStore()
  const playerStore = deps.playerStore ?? usePlayerStore()

  const likedSongs = deps.likedSongs ?? useLikedSongs()
  const userPlaylists = deps.userPlaylists ?? useUserPlaylists()
  const favoriteAlbums = deps.favoriteAlbums ?? useFavoriteAlbums()
  const userEvents = deps.userEvents ?? useUserEvents()

  const activeTab = ref<UserTab>(parseUserTab(route.query.tab))
  const loadingMap = ref<UserTabStateMap>(createLoadingMap())
  const mountedTabs = ref<UserTabStateMap>(createMountedTabs(activeTab.value))
  const loadedTabs = ref<UserTabStateMap>(createLoadedTabs())

  const currentUserId = computed(() => userStore.userId)
  const avatarUrl = computed(() => userStore.avatarUrl)
  const nickname = computed(() => userStore.nickname)

  const {
    count: likedCount,
    formattedSongs,
    hasMore: likedSongsHasMore,
    likeSongs,
    loadLikedSongs,
    loadMoreLikedSongs,
    loadingMore: likedSongsLoadingMore,
    retryLoadLikedSongs,
    resetLikedSongs,
    error: likedSongsError
  } = likedSongs
  const {
    count: playlistCount,
    createdPlaylists,
    error: playlistsError,
    favoritePlaylists,
    loadPlaylistSongs,
    loadPlaylists,
    playlists,
    resetPlaylists
  } = userPlaylists
  const {
    albums,
    count: albumCount,
    error: albumsError,
    loadAlbumSongs,
    loadFavoriteAlbums,
    resetFavoriteAlbums
  } = favoriteAlbums
  const {
    activeFilter: eventsFilter,
    count: eventsCount,
    error: eventsError,
    events,
    filteredEvents,
    hasMore: eventsHasMore,
    loadEvents,
    loadMoreEvents,
    loadingMore: eventsLoadingMore,
    retryLoadEvents,
    resetEvents,
    setFilter: setEventsFilter
  } = userEvents

  let syncRouteQueryBridge = (): void => {}
  let loadTabDataBridge: (
    tab: UserTab,
    userId: string | number,
    force?: boolean
  ) => Promise<void> = async () => {}

  const details = useUserCenterDetails({
    route,
    activeTab,
    mountedTabs,
    isLoggedIn: () => userStore.isLoggedIn,
    getCurrentUserId: () => userStore.userId,
    loadTabData: (tab, userId, force) => loadTabDataBridge(tab, userId, force),
    loadPlaylistSongs,
    loadAlbumSongs,
    syncRouteQuery: () => syncRouteQueryBridge()
  })

  const tabs = useUserCenterTabs({
    route,
    router,
    userStore,
    activeTab,
    loadingMap,
    mountedTabs,
    loadedTabs,
    loadLikedSongs,
    retryLoadLikedSongs,
    resetLikedSongs,
    loadPlaylists,
    resetPlaylists,
    loadFavoriteAlbums,
    resetFavoriteAlbums,
    loadEvents,
    retryLoadEvents,
    resetEvents,
    selectedPlaylistId: details.selectedPlaylistId,
    selectedAlbumId: details.selectedAlbumId,
    resetPlaylistDetail: details.resetPlaylistDetail,
    resetAlbumDetail: details.resetAlbumDetail,
    resetDetailState: details.resetDetailState,
    loadPlaylistDetail: details.loadPlaylistDetail,
    loadAlbumDetail: details.loadAlbumDetail
  })

  syncRouteQueryBridge = tabs.syncRouteQuery
  loadTabDataBridge = tabs.loadTabData

  const tabCounts = computed(
    (): Record<UserTab, number> => ({
      liked: likedCount.value,
      playlist: playlistCount.value,
      album: favoritePlaylists.value.length + albumCount.value,
      events: eventsCount.value
    })
  )
  const selectedPlaylist = computed(() => {
    const playlistId = details.selectedPlaylistId.value
    if (!playlistId) {
      return null
    }

    return playlists.value.find(playlist => String(playlist.id) === playlistId) ?? null
  })
  const selectedAlbum = computed(() => {
    const albumId = details.selectedAlbumId.value
    if (!albumId) {
      return null
    }

    return albums.value.find(album => String(album.id) === albumId) ?? null
  })
  const activeTabError = computed(() => {
    if (activeTab.value === 'playlist') {
      return playlistsError.value
    }

    if (activeTab.value === 'album') {
      return playlistsError.value ?? albumsError.value
    }

    return null
  })

  const playback = useUserCenterPlayback({
    router,
    playlistStore,
    playerStore,
    likeSongs,
    selectedPlaylistSongs: details.selectedPlaylistSongs,
    selectedAlbumSongs: details.selectedAlbumSongs,
    loadingMap,
    loadPlaylistDetail: details.loadPlaylistDetail,
    loadAlbumDetail: details.loadAlbumDetail,
    getCachedPlaylistSongs: details.getCachedPlaylistSongs,
    getCachedAlbumSongs: details.getCachedAlbumSongs
  })

  return {
    activeTab,
    loadingMap,
    mountedTabs,
    loadedTabs,
    currentUserId,
    avatarUrl,
    nickname,
    selectedPlaylistId: details.selectedPlaylistId,
    selectedPlaylist,
    selectedPlaylistSongs: details.selectedPlaylistSongs,
    playlistDetailLoading: details.playlistDetailLoading,
    playlistDetailError: details.playlistDetailError,
    selectedAlbumId: details.selectedAlbumId,
    selectedAlbum,
    selectedAlbumSongs: details.selectedAlbumSongs,
    albumDetailLoading: details.albumDetailLoading,
    albumDetailError: details.albumDetailError,
    activeTabError,
    likedCount,
    playlistCount,
    albumCount,
    eventsCount,
    tabCounts,
    likedSongsHasMore,
    likedSongsLoadingMore,
    likedSongsError,
    likeSongs,
    formattedSongs,
    loadLikedSongs,
    loadMoreLikedSongs,
    retryLoadLikedSongs,
    resetLikedSongs,
    playlists: createdPlaylists,
    favoritePlaylists,
    loadPlaylists,
    loadPlaylistSongs,
    resetPlaylists,
    albums,
    loadFavoriteAlbums,
    loadAlbumSongs,
    resetFavoriteAlbums,
    eventsFilter,
    setEventsFilter,
    events,
    filteredEvents,
    eventsHasMore,
    eventsLoadingMore,
    eventsError,
    loadEvents,
    loadMoreEvents,
    retryLoadEvents,
    resetEvents,
    switchTab: tabs.switchTab,
    openPlaylistDetail: details.openPlaylistDetail,
    closePlaylistDetail: details.closePlaylistDetail,
    openAlbumDetail: details.openAlbumDetail,
    closeAlbumDetail: details.closeAlbumDetail,
    retryActiveTab: tabs.retryActiveTab,
    retryPlaylistDetail: details.retryPlaylistDetail,
    retryAlbumDetail: details.retryAlbumDetail,
    resetUserContent: tabs.resetUserContent,
    loadTabData: tabs.loadTabData,
    playEventSong: playback.playEventSong,
    playPlaylist: playback.playPlaylist,
    playPlaylistTrackAt: playback.playPlaylistTrackAt,
    playAlbum: playback.playAlbum,
    playAlbumTrackAt: playback.playAlbumTrackAt,
    playAllLikedSongs: playback.playAllLikedSongs,
    playLikedSongAt: playback.playLikedSongAt,
    goBack: tabs.goBack
  }
}

export default useUserCenterPage
