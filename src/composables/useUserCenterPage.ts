import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded, type Router } from 'vue-router'

import { useFavoriteAlbums, type UseFavoriteAlbumsReturn } from '@/composables/useFavoriteAlbums'
import { useLikedSongs, type UseLikedSongsReturn } from '@/composables/useLikedSongs'
import { useUserEvents, type UseUserEventsReturn } from '@/composables/useUserEvents'
import { useUserPlaylists, type UseUserPlaylistsReturn } from '@/composables/useUserPlaylists'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useUserStore } from '@/store/userStore'

export type UserTab = 'liked' | 'playlist' | 'album' | 'events'

type UserTabStateMap = Record<UserTab, boolean>
type UserStoreLike = Pick<
  ReturnType<typeof useUserStore>,
  'avatarUrl' | 'isLoggedIn' | 'nickname' | 'userId'
>
type PlaylistStoreLike = Pick<ReturnType<typeof usePlaylistStore>, 'setPlaylist'>
type PlayerStoreLike = Pick<
  ReturnType<typeof usePlayerStore>,
  'playSongWithDetails' | 'setSongList'
>
type UserCenterRouterLike = Pick<Router, 'push' | 'replace'>
type UserCenterRouteLike = Pick<RouteLocationNormalizedLoaded, 'query'>
type UserCenterLikedSongsLike = Pick<
  UseLikedSongsReturn,
  | 'count'
  | 'error'
  | 'formattedSongs'
  | 'hasMore'
  | 'likeSongs'
  | 'loadLikedSongs'
  | 'loadMoreLikedSongs'
  | 'loadingMore'
  | 'retryLoadLikedSongs'
  | 'resetLikedSongs'
>
type UserCenterPlaylistsLike = Pick<
  UseUserPlaylistsReturn,
  | 'count'
  | 'createdPlaylists'
  | 'error'
  | 'favoritePlaylists'
  | 'loadPlaylistSongs'
  | 'loadPlaylists'
  | 'playlists'
  | 'resetPlaylists'
>
type UserCenterFavoriteAlbumsLike = Pick<
  UseFavoriteAlbumsReturn,
  'albums' | 'count' | 'error' | 'loadAlbumSongs' | 'loadFavoriteAlbums' | 'resetFavoriteAlbums'
>
type UserCenterEventsLike = Pick<
  UseUserEventsReturn,
  | 'activeFilter'
  | 'count'
  | 'error'
  | 'events'
  | 'filteredEvents'
  | 'hasMore'
  | 'loadEvents'
  | 'loadMoreEvents'
  | 'loadingMore'
  | 'retryLoadEvents'
  | 'resetEvents'
  | 'setFilter'
>

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

function createLoadingMap(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
    album: false,
    events: false
  }
}

function createMountedTabs(activeTab: UserTab = 'liked'): UserTabStateMap {
  return {
    liked: activeTab === 'liked',
    playlist: activeTab === 'playlist',
    album: activeTab === 'album',
    events: activeTab === 'events'
  }
}

function createLoadedTabs(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
    album: false,
    events: false
  }
}

function parseQueryValue(value: unknown): string | null {
  const normalizedValue = Array.isArray(value) ? value[0] : value
  if (normalizedValue == null) {
    return null
  }

  const stringValue = String(normalizedValue).trim()
  return stringValue.length > 0 ? stringValue : null
}

function parseUserTab(value: unknown): UserTab {
  const normalizedValue = parseQueryValue(value)
  if (
    normalizedValue === 'playlist' ||
    normalizedValue === 'album' ||
    normalizedValue === 'events' ||
    normalizedValue === 'liked'
  ) {
    return normalizedValue
  }

  return 'liked'
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
  const selectedPlaylistId = ref<string | null>(
    activeTab.value === 'playlist' ? parseQueryValue(route.query.playlistId) : null
  )
  const selectedPlaylistSongs = ref<Song[]>([])
  const playlistDetailLoading = ref(false)
  const playlistDetailError = ref<unknown>(null)
  const selectedAlbumId = ref<string | null>(
    activeTab.value === 'album' ? parseQueryValue(route.query.albumId) : null
  )
  const selectedAlbumSongs = ref<Song[]>([])
  const albumDetailLoading = ref(false)
  const albumDetailError = ref<unknown>(null)

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

  const tabCounts = computed(
    (): Record<UserTab, number> => ({
      liked: likedCount.value,
      playlist: playlistCount.value,
      album: favoritePlaylists.value.length + albumCount.value,
      events: eventsCount.value
    })
  )
  const selectedPlaylist = computed(() => {
    const playlistId = selectedPlaylistId.value
    if (!playlistId) {
      return null
    }

    return playlists.value.find(playlist => String(playlist.id) === playlistId) ?? null
  })
  const selectedAlbum = computed(() => {
    const albumId = selectedAlbumId.value
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

  let activeLoadId = 0
  let activePlaylistDetailLoadId = 0
  let activeAlbumDetailLoadId = 0
  const playlistSongsCache = new Map<string, Song[]>()
  const albumSongsCache = new Map<string, Song[]>()

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

  const resetPlaylistDetail = (): void => {
    activePlaylistDetailLoadId += 1
    selectedPlaylistId.value = null
    selectedPlaylistSongs.value = []
    playlistDetailLoading.value = false
    playlistDetailError.value = null
  }

  const resetAlbumDetail = (): void => {
    activeAlbumDetailLoadId += 1
    selectedAlbumId.value = null
    selectedAlbumSongs.value = []
    albumDetailLoading.value = false
    albumDetailError.value = null
  }

  const loadPlaylistDetail = async (
    playlistId: string | number,
    force = false
  ): Promise<Song[]> => {
    const normalizedPlaylistId = String(playlistId)
    const cachedSongs = playlistSongsCache.get(normalizedPlaylistId)
    if (!force && cachedSongs) {
      selectedPlaylistSongs.value = cachedSongs
      playlistDetailError.value = null
      return cachedSongs
    }

    const loadId = ++activePlaylistDetailLoadId
    playlistDetailLoading.value = true
    playlistDetailError.value = null

    try {
      const songs = await loadPlaylistSongs(playlistId)

      if (
        loadId !== activePlaylistDetailLoadId ||
        selectedPlaylistId.value !== normalizedPlaylistId
      ) {
        return songs
      }

      playlistSongsCache.set(normalizedPlaylistId, songs)
      selectedPlaylistSongs.value = songs
      return songs
    } catch (error) {
      if (
        loadId !== activePlaylistDetailLoadId ||
        selectedPlaylistId.value !== normalizedPlaylistId
      ) {
        return []
      }

      selectedPlaylistSongs.value = []
      playlistDetailError.value = error
      return []
    } finally {
      if (loadId === activePlaylistDetailLoadId) {
        playlistDetailLoading.value = false
      }
    }
  }

  const loadAlbumDetail = async (albumId: string | number, force = false): Promise<Song[]> => {
    const normalizedAlbumId = String(albumId)
    const cachedSongs = albumSongsCache.get(normalizedAlbumId)
    if (!force && cachedSongs) {
      selectedAlbumSongs.value = cachedSongs
      albumDetailError.value = null
      return cachedSongs
    }

    const loadId = ++activeAlbumDetailLoadId
    albumDetailLoading.value = true
    albumDetailError.value = null

    try {
      const songs = await loadAlbumSongs(albumId)

      if (loadId !== activeAlbumDetailLoadId || selectedAlbumId.value !== normalizedAlbumId) {
        return songs
      }

      albumSongsCache.set(normalizedAlbumId, songs)
      selectedAlbumSongs.value = songs
      return songs
    } catch (error) {
      if (loadId !== activeAlbumDetailLoadId || selectedAlbumId.value !== normalizedAlbumId) {
        return []
      }

      selectedAlbumSongs.value = []
      albumDetailError.value = error
      return []
    } finally {
      if (loadId === activeAlbumDetailLoadId) {
        albumDetailLoading.value = false
      }
    }
  }

  const resetUserContent = (): void => {
    activeLoadId += 1
    playlistSongsCache.clear()
    albumSongsCache.clear()
    activeTab.value = parseUserTab(route.query.tab)
    mountedTabs.value = createMountedTabs(activeTab.value)
    loadedTabs.value = createLoadedTabs()
    loadingMap.value = createLoadingMap()
    selectedPlaylistId.value =
      activeTab.value === 'playlist' ? parseQueryValue(route.query.playlistId) : null
    selectedPlaylistSongs.value = []
    playlistDetailLoading.value = false
    playlistDetailError.value = null
    selectedAlbumId.value =
      activeTab.value === 'album' ? parseQueryValue(route.query.albumId) : null
    selectedAlbumSongs.value = []
    albumDetailLoading.value = false
    albumDetailError.value = null
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

  const playSongs = async (songs: Song[], index: number): Promise<void> => {
    if (songs.length === 0) {
      return
    }

    playlistStore.setPlaylist(songs)
    playerStore.setSongList(songs)

    try {
      await playerStore.playSongWithDetails(index)
      void router.push('/')
    } catch (error) {
      console.error('播放失败:', error)
    }
  }

  const playPlaylist = async (playlistId: string | number): Promise<void> => {
    loadingMap.value.playlist = true

    try {
      const normalizedPlaylistId = String(playlistId)
      const songs =
        playlistSongsCache.get(normalizedPlaylistId) ?? (await loadPlaylistDetail(playlistId, true))
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取歌单详情失败:', error)
    } finally {
      loadingMap.value.playlist = false
    }
  }

  const playAlbum = async (albumId: string | number): Promise<void> => {
    loadingMap.value.album = true

    try {
      const normalizedAlbumId = String(albumId)
      const songs = albumSongsCache.get(normalizedAlbumId) ?? (await loadAlbumDetail(albumId, true))
      await playSongs(songs, 0)
    } catch (error) {
      console.error('获取专辑详情失败:', error)
    } finally {
      loadingMap.value.album = false
    }
  }

  const playAllLikedSongs = async (): Promise<void> => {
    await playSongs(likeSongs.value, 0)
  }

  const playEventSong = async (song: Song): Promise<void> => {
    await playSongs([song], 0)
  }

  const playPlaylistTrackAt = async (index: number): Promise<void> => {
    await playSongs(selectedPlaylistSongs.value, index)
  }

  const playAlbumTrackAt = async (index: number): Promise<void> => {
    await playSongs(selectedAlbumSongs.value, index)
  }

  const playLikedSongAt = async (index: number): Promise<void> => {
    await playSongs(likeSongs.value, index)
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

    const userId = currentUserId.value
    if (!userStore.isLoggedIn || !userId) {
      return
    }

    void loadTabData(tab, userId)
  }

  const openPlaylistDetail = async (playlistId: string | number): Promise<void> => {
    const normalizedPlaylistId = String(playlistId)
    mountedTabs.value.playlist = true
    activeTab.value = 'playlist'
    selectedPlaylistId.value = normalizedPlaylistId
    syncRouteQuery()

    const userId = currentUserId.value
    if (userStore.isLoggedIn && userId) {
      await loadTabData('playlist', userId)
    }

    await loadPlaylistDetail(normalizedPlaylistId)
  }

  const closePlaylistDetail = (): void => {
    resetPlaylistDetail()
    if (activeTab.value !== 'playlist') {
      activeTab.value = 'playlist'
      mountedTabs.value.playlist = true
    }
    syncRouteQuery()
  }

  const openAlbumDetail = async (albumId: string | number): Promise<void> => {
    const normalizedAlbumId = String(albumId)
    mountedTabs.value.album = true
    activeTab.value = 'album'
    selectedAlbumId.value = normalizedAlbumId
    syncRouteQuery()

    const userId = currentUserId.value
    if (userStore.isLoggedIn && userId) {
      await loadTabData('album', userId)
    }

    await loadAlbumDetail(normalizedAlbumId)
  }

  const closeAlbumDetail = (): void => {
    resetAlbumDetail()
    if (activeTab.value !== 'album') {
      activeTab.value = 'album'
      mountedTabs.value.album = true
    }
    syncRouteQuery()
  }

  const retryActiveTab = async (): Promise<void> => {
    const userId = currentUserId.value
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

    if (activeTab.value === 'album') {
      await loadTabData(activeTab.value, userId, true)
      return
    }

    await loadTabData(activeTab.value, userId, true)
  }

  const retryPlaylistDetail = async (): Promise<void> => {
    if (!selectedPlaylistId.value) {
      return
    }

    await loadPlaylistDetail(selectedPlaylistId.value, true)
  }

  const retryAlbumDetail = async (): Promise<void> => {
    if (!selectedAlbumId.value) {
      return
    }

    await loadAlbumDetail(selectedAlbumId.value, true)
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

        const userId = currentUserId.value
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
    activeTab,
    loadingMap,
    mountedTabs,
    loadedTabs,
    currentUserId,
    avatarUrl,
    nickname,
    selectedPlaylistId,
    selectedPlaylist,
    selectedPlaylistSongs,
    playlistDetailLoading,
    playlistDetailError,
    selectedAlbumId,
    selectedAlbum,
    selectedAlbumSongs,
    albumDetailLoading,
    albumDetailError,
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
    switchTab,
    openPlaylistDetail,
    closePlaylistDetail,
    openAlbumDetail,
    closeAlbumDetail,
    retryActiveTab,
    retryPlaylistDetail,
    retryAlbumDetail,
    resetUserContent,
    loadTabData,
    playEventSong,
    playPlaylist,
    playPlaylistTrackAt,
    playAlbum,
    playAlbumTrackAt,
    playAllLikedSongs,
    playLikedSongAt,
    goBack
  }
}

export default useUserCenterPage
