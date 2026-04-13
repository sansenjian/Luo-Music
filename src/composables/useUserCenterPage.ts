import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded, type Router } from 'vue-router'

import { useLikedSongs, type UseLikedSongsReturn } from '@/composables/useLikedSongs'
import { useUserEvents, type UseUserEventsReturn } from '@/composables/useUserEvents'
import { useUserPlaylists, type UseUserPlaylistsReturn } from '@/composables/useUserPlaylists'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useUserStore } from '@/store/userStore'

export type UserTab = 'liked' | 'playlist' | 'events'

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
  'count' | 'error' | 'loadPlaylistSongs' | 'loadPlaylists' | 'playlists' | 'resetPlaylists'
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
  activeTabError: ComputedRef<unknown>
  likedCount: UserCenterLikedSongsLike['count']
  playlistCount: UserCenterPlaylistsLike['count']
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
  playlists: UserCenterPlaylistsLike['playlists']
  loadPlaylists: UserCenterPlaylistsLike['loadPlaylists']
  loadPlaylistSongs: UserCenterPlaylistsLike['loadPlaylistSongs']
  resetPlaylists: UserCenterPlaylistsLike['resetPlaylists']
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
  retryActiveTab: () => Promise<void>
  retryPlaylistDetail: () => Promise<void>
  resetUserContent: () => void
  loadTabData: (tab: UserTab, userId: string | number, force?: boolean) => Promise<void>
  playEventSong: (song: Song) => Promise<void>
  playPlaylist: (playlistId: string | number) => Promise<void>
  playPlaylistTrackAt: (index: number) => Promise<void>
  playAllLikedSongs: () => Promise<void>
  playLikedSongAt: (index: number) => Promise<void>
  goBack: () => void
}

function createLoadingMap(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
    events: false
  }
}

function createMountedTabs(activeTab: UserTab = 'liked'): UserTabStateMap {
  return {
    liked: activeTab === 'liked',
    playlist: activeTab === 'playlist',
    events: activeTab === 'events'
  }
}

function createLoadedTabs(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
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
    error: playlistsError,
    loadPlaylistSongs,
    loadPlaylists,
    playlists,
    resetPlaylists
  } = userPlaylists
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
  const activeTabError = computed(() => {
    if (activeTab.value === 'playlist') {
      return playlistsError.value
    }

    return null
  })

  let activeLoadId = 0
  let activePlaylistDetailLoadId = 0
  const playlistSongsCache = new Map<string, Song[]>()

  const syncRouteQuery = (): void => {
    const nextQuery: Record<string, string> = {
      tab: activeTab.value
    }

    if (activeTab.value === 'playlist' && selectedPlaylistId.value) {
      nextQuery.playlistId = selectedPlaylistId.value
    }

    const currentTab = parseUserTab(route.query.tab)
    const currentPlaylistId =
      currentTab === 'playlist' ? parseQueryValue(route.query.playlistId) : null

    if (currentTab === nextQuery.tab && currentPlaylistId === (nextQuery.playlistId ?? null)) {
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

  const resetUserContent = (): void => {
    activeLoadId += 1
    playlistSongsCache.clear()
    activeTab.value = parseUserTab(route.query.tab)
    mountedTabs.value = createMountedTabs(activeTab.value)
    loadedTabs.value = createLoadedTabs()
    loadingMap.value = createLoadingMap()
    selectedPlaylistId.value =
      activeTab.value === 'playlist' ? parseQueryValue(route.query.playlistId) : null
    selectedPlaylistSongs.value = []
    playlistDetailLoading.value = false
    playlistDetailError.value = null
    resetLikedSongs()
    resetPlaylists()
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

  const playAllLikedSongs = async (): Promise<void> => {
    await playSongs(likeSongs.value, 0)
  }

  const playEventSong = async (song: Song): Promise<void> => {
    await playSongs([song], 0)
  }

  const playPlaylistTrackAt = async (index: number): Promise<void> => {
    await playSongs(selectedPlaylistSongs.value, index)
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

    await loadTabData(activeTab.value, userId, true)
  }

  const retryPlaylistDetail = async (): Promise<void> => {
    if (!selectedPlaylistId.value) {
      return
    }

    await loadPlaylistDetail(selectedPlaylistId.value, true)
  }

  watch(
    () => [route.query.tab, route.query.playlistId] as const,
    ([queryTab, queryPlaylistId]) => {
      const nextTab = parseUserTab(queryTab)
      const nextPlaylistId = nextTab === 'playlist' ? parseQueryValue(queryPlaylistId) : null

      if (activeTab.value !== nextTab) {
        activeTab.value = nextTab
        mountedTabs.value[nextTab] = true

        const userId = currentUserId.value
        if (userStore.isLoggedIn && userId) {
          void loadTabData(nextTab, userId)
        }
      }

      if (selectedPlaylistId.value === nextPlaylistId) {
        return
      }

      if (!nextPlaylistId) {
        resetPlaylistDetail()
        return
      }

      selectedPlaylistId.value = nextPlaylistId
      void loadPlaylistDetail(nextPlaylistId)
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
    activeTabError,
    likedCount,
    playlistCount,
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
    playlists,
    loadPlaylists,
    loadPlaylistSongs,
    resetPlaylists,
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
    retryActiveTab,
    retryPlaylistDetail,
    resetUserContent,
    loadTabData,
    playEventSong,
    playPlaylist,
    playPlaylistTrackAt,
    playAllLikedSongs,
    playLikedSongAt,
    goBack
  }
}

export default useUserCenterPage
