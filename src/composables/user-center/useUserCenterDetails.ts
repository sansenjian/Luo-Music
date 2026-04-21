import { ref, type Ref } from 'vue'

import type { PlaylistTracksState } from '@/composables/useUserPlaylists'
import type { Song } from '@/platform/music/interface'

import { parseQueryValue, type UserTab, type UserTabStateMap } from './shared'
import type { LoadSongsById, UserCenterRouteLike, UserStoreLike } from './types'

export interface UseUserCenterDetailsOptions {
  route: UserCenterRouteLike
  activeTab: Ref<UserTab>
  mountedTabs: Ref<UserTabStateMap>
  isLoggedIn: () => boolean
  getCurrentUserId: () => UserStoreLike['userId']
  loadTabData: (tab: UserTab, userId: string | number, force?: boolean) => Promise<void>
  loadPlaylistSongs: LoadSongsById
  usePlaylistTracks: () => PlaylistTracksState
  loadAlbumSongs: LoadSongsById
  syncRouteQuery: () => void
}

export interface UseUserCenterDetailsReturn {
  selectedPlaylistId: Ref<string | null>
  selectedPlaylistSongs: Ref<Song[]>
  playlistDetailLoading: Ref<boolean>
  playlistDetailError: Ref<unknown>
  playlistHasMore: Ref<boolean>
  playlistLoadingMore: Ref<boolean>
  loadMorePlaylistSongs: () => Promise<void>
  selectedAlbumId: Ref<string | null>
  selectedAlbumSongs: Ref<Song[]>
  albumDetailLoading: Ref<boolean>
  albumDetailError: Ref<unknown>
  resetPlaylistDetail: () => void
  resetAlbumDetail: () => void
  resetDetailState: () => void
  loadPlaylistDetail: (playlistId: string | number, force?: boolean) => Promise<Song[]>
  loadAlbumDetail: (albumId: string | number, force?: boolean) => Promise<Song[]>
  openPlaylistDetail: (playlistId: string | number) => Promise<void>
  closePlaylistDetail: () => void
  openAlbumDetail: (albumId: string | number) => Promise<void>
  closeAlbumDetail: () => void
  retryPlaylistDetail: () => Promise<void>
  retryAlbumDetail: () => Promise<void>
  getCachedPlaylistSongs: (playlistId: string | number) => Song[] | undefined
  getCachedAlbumSongs: (albumId: string | number) => Song[] | undefined
}

export function useUserCenterDetails(
  options: UseUserCenterDetailsOptions
): UseUserCenterDetailsReturn {
  const {
    activeTab,
    getCurrentUserId,
    isLoggedIn,
    loadAlbumSongs,
    usePlaylistTracks,
    loadTabData,
    mountedTabs,
    route,
    syncRouteQuery
  } = options

  const selectedPlaylistId = ref<string | null>(
    activeTab.value === 'playlist' ? parseQueryValue(route.query.playlistId) : null
  )
  const tracksState = usePlaylistTracks()
  const selectedPlaylistSongs = tracksState.songs
  const playlistDetailLoading = tracksState.loading
  const playlistDetailError = tracksState.error
  const playlistHasMore = tracksState.hasMore
  const playlistLoadingMore = tracksState.loadingMore
  const selectedAlbumId = ref<string | null>(
    activeTab.value === 'album' ? parseQueryValue(route.query.albumId) : null
  )
  const selectedAlbumSongs = ref<Song[]>([])
  const albumDetailLoading = ref(false)
  const albumDetailError = ref<unknown>(null)

  let activePlaylistDetailLoadId = 0
  let activeAlbumDetailLoadId = 0
  const playlistSongsCache = new Map<string, Song[]>()
  const albumSongsCache = new Map<string, Song[]>()

  const loadPlaylistDetailSafely = async (
    playlistId: string | number,
    force = false
  ): Promise<void> => {
    try {
      await loadPlaylistDetail(playlistId, force)
    } catch {
      // Detail state is updated inside loadPlaylistDetail; callers only need a settled promise.
    }
  }

  const loadAlbumDetailSafely = async (albumId: string | number, force = false): Promise<void> => {
    try {
      await loadAlbumDetail(albumId, force)
    } catch {
      // Detail state is updated inside loadAlbumDetail; callers only need a settled promise.
    }
  }

  const beginPlaylistDetailTransition = (playlistId: string): void => {
    activePlaylistDetailLoadId += 1
    selectedPlaylistId.value = playlistId
    tracksState.reset()
  }

  const beginAlbumDetailTransition = (albumId: string): void => {
    activeAlbumDetailLoadId += 1
    selectedAlbumId.value = albumId
    selectedAlbumSongs.value = []
    albumDetailLoading.value = true
    albumDetailError.value = null
  }

  const resetPlaylistDetail = (): void => {
    activePlaylistDetailLoadId += 1
    selectedPlaylistId.value = null
    tracksState.reset()
  }

  const resetAlbumDetail = (): void => {
    activeAlbumDetailLoadId += 1
    selectedAlbumId.value = null
    selectedAlbumSongs.value = []
    albumDetailLoading.value = false
    albumDetailError.value = null
  }

  const resetDetailState = (): void => {
    activePlaylistDetailLoadId += 1
    activeAlbumDetailLoadId += 1
    playlistSongsCache.clear()
    albumSongsCache.clear()
    selectedPlaylistId.value =
      activeTab.value === 'playlist' ? parseQueryValue(route.query.playlistId) : null
    tracksState.reset()
    selectedAlbumId.value =
      activeTab.value === 'album' ? parseQueryValue(route.query.albumId) : null
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
      return cachedSongs
    }

    const loadId = ++activePlaylistDetailLoadId

    try {
      const songs = await tracksState.loadFirstPage(playlistId)

      if (
        loadId !== activePlaylistDetailLoadId ||
        selectedPlaylistId.value !== normalizedPlaylistId
      ) {
        return songs
      }

      playlistSongsCache.set(normalizedPlaylistId, songs)
      return songs
    } catch (error) {
      if (
        loadId !== activePlaylistDetailLoadId ||
        selectedPlaylistId.value !== normalizedPlaylistId
      ) {
        return []
      }

      throw error
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
      throw error
    } finally {
      if (loadId === activeAlbumDetailLoadId) {
        albumDetailLoading.value = false
      }
    }
  }

  const openPlaylistDetail = async (playlistId: string | number): Promise<void> => {
    const normalizedPlaylistId = String(playlistId)
    mountedTabs.value.playlist = true
    activeTab.value = 'playlist'
    beginPlaylistDetailTransition(normalizedPlaylistId)
    syncRouteQuery()

    const userId = getCurrentUserId()
    const tabDataPromise =
      isLoggedIn() && userId ? loadTabData('playlist', userId) : Promise.resolve()

    await Promise.all([tabDataPromise, loadPlaylistDetailSafely(normalizedPlaylistId)])
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
    beginAlbumDetailTransition(normalizedAlbumId)
    syncRouteQuery()

    const userId = getCurrentUserId()
    if (isLoggedIn() && userId) {
      await loadTabData('album', userId)
    }

    await loadAlbumDetailSafely(normalizedAlbumId)
  }

  const closeAlbumDetail = (): void => {
    resetAlbumDetail()
    if (activeTab.value !== 'album') {
      activeTab.value = 'album'
      mountedTabs.value.album = true
    }
    syncRouteQuery()
  }

  const retryPlaylistDetail = async (): Promise<void> => {
    if (!selectedPlaylistId.value) {
      return
    }

    await loadPlaylistDetailSafely(selectedPlaylistId.value, true)
  }

  const loadMorePlaylistSongs = async (): Promise<void> => {
    await tracksState.loadMore()
  }

  const retryAlbumDetail = async (): Promise<void> => {
    if (!selectedAlbumId.value) {
      return
    }

    await loadAlbumDetailSafely(selectedAlbumId.value, true)
  }

  const getCachedPlaylistSongs = (playlistId: string | number): Song[] | undefined =>
    playlistSongsCache.get(String(playlistId))

  const getCachedAlbumSongs = (albumId: string | number): Song[] | undefined =>
    albumSongsCache.get(String(albumId))

  return {
    selectedPlaylistId,
    selectedPlaylistSongs,
    playlistDetailLoading,
    playlistDetailError,
    playlistHasMore,
    playlistLoadingMore,
    loadMorePlaylistSongs,
    selectedAlbumId,
    selectedAlbumSongs,
    albumDetailLoading,
    albumDetailError,
    resetPlaylistDetail,
    resetAlbumDetail,
    resetDetailState,
    loadPlaylistDetail,
    loadAlbumDetail,
    openPlaylistDetail,
    closePlaylistDetail,
    openAlbumDetail,
    closeAlbumDetail,
    retryPlaylistDetail,
    retryAlbumDetail,
    getCachedPlaylistSongs,
    getCachedAlbumSongs
  }
}
