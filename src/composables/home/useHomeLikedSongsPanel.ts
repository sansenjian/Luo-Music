import { computed, ref, watch } from 'vue'

import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import type { FavoriteAlbumItem } from '@/composables/useFavoriteAlbums'
import { useLikedSongs } from '@/composables/useLikedSongs'
import { useLocalLibrary } from '@/composables/useLocalLibrary'
import type { Song } from '@/platform/music/interface'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'

import {
  buildPlaybackSelection,
  createHomeMediaSong,
  filterMediaSongsByQuery,
  playMediaSongSelection,
  resolvePanelErrorMessage
} from './mediaPanelShared'

type LikedContentSection = 'songs' | 'albums'

type HomeLikedSongsPanelDeps = {
  localLibrary?: ReturnType<typeof useLocalLibrary>
}

export function useHomeLikedSongsPanel(deps: HomeLikedSongsPanelDeps = {}) {
  const userStore = useUserStore()
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  const localLibrary = deps.localLibrary ?? useLocalLibrary()
  const {
    count,
    error,
    hasMore,
    likeSongs,
    loadLikedSongs,
    loadMoreLikedSongs,
    loading,
    loadingMore,
    retryLoadLikedSongs,
    resetLikedSongs
  } = useLikedSongs()
  const {
    albums,
    count: albumCount,
    error: albumsError,
    loadAlbumSongs,
    loadFavoriteAlbums,
    loading: albumsLoading,
    resetFavoriteAlbums
  } = useFavoriteAlbums()
  const localLibraryState = localLibrary.stateGroup.state
  const localLibraryStatus = localLibrary.stateGroup.status
  const localSongsPage = localLibrary.queries.songsPage
  const localCoverUrls = localLibrary.queries.coverUrls
  const loadLocalTracks = localLibrary.queries.loadTracks

  const activeSection = ref<LikedContentSection>('songs')
  const searchQuery = ref('')
  const selectedAlbumId = ref<string | null>(null)
  const selectedAlbumSongs = ref<Song[]>([])
  const albumDetailLoading = ref(false)
  const albumDetailError = ref<unknown>(null)
  const playingAlbumId = ref<string | null>(null)
  const albumSongsCache = new Map<string, Song[]>()
  let activeAlbumDetailLoadId = 0
  let activeAlbumPlayId = 0
  let loadAllLocalSongsPromise: Promise<void> | null = null

  const localPlaybackSongs = computed<Song[]>(() =>
    localSongsPage.value.items.map(track => {
      const coverUrl = track.coverHash ? (localCoverUrls.value[track.coverHash] ?? '') : ''

      return {
        ...track.song,
        album: {
          ...track.song.album,
          picUrl: coverUrl || track.song.album.picUrl
        }
      }
    })
  )
  const combinedSongs = computed<Song[]>(() => [...likeSongs.value, ...localPlaybackSongs.value])
  const mediaSongs = computed(() => combinedSongs.value.map(song => createHomeMediaSong(song)))
  const filteredSongs = computed(() => filterMediaSongsByQuery(mediaSongs.value, searchQuery.value))
  const filteredPlaybackSongs = computed<Song[]>(() => {
    const sourceSongsById = new Map(combinedSongs.value.map(song => [song.id, song]))
    return filteredSongs.value
      .map(song => sourceSongsById.get(song.id))
      .filter((song): song is Song => Boolean(song))
  })
  const filteredAlbums = computed<FavoriteAlbumItem[]>(() => {
    const normalizedQuery = searchQuery.value.trim().toLocaleLowerCase()
    if (!normalizedQuery) {
      return albums.value
    }

    return albums.value.filter(album =>
      [album.name, album.artistName].some(field =>
        String(field ?? '')
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    )
  })
  const selectedAlbum = computed<FavoriteAlbumItem | null>(
    () => albums.value.find(album => String(album.id) === selectedAlbumId.value) ?? null
  )
  const isSongsSectionActive = computed(() => activeSection.value === 'songs')
  const isAlbumsSectionActive = computed(() => activeSection.value === 'albums')
  const coverUrl = computed(() => {
    if (isAlbumsSectionActive.value) {
      return (
        selectedAlbum.value?.picUrl ||
        filteredAlbums.value[0]?.picUrl ||
        albums.value[0]?.picUrl ||
        filteredSongs.value[0]?.cover ||
        mediaSongs.value[0]?.cover ||
        ''
      )
    }

    return (
      filteredSongs.value[0]?.cover ||
      mediaSongs.value[0]?.cover ||
      selectedAlbum.value?.picUrl ||
      filteredAlbums.value[0]?.picUrl ||
      albums.value[0]?.picUrl ||
      ''
    )
  })
  const totalSongCountLabel = computed(() =>
    isAlbumsSectionActive.value ? `${albumCount.value} 张专辑` : `${mediaSongs.value.length} 首歌曲`
  )
  const userMetaLabel = computed(() => {
    if (isAlbumsSectionActive.value) {
      return userStore.nickname ? `${userStore.nickname} · 收藏专辑` : '收藏专辑'
    }

    if (!userStore.isLoggedIn && localPlaybackSongs.value.length > 0) {
      return '本地音乐'
    }

    if (userStore.isLoggedIn && localPlaybackSongs.value.length > 0) {
      return `${userStore.nickname} · 网络喜欢 + 本地音乐`
    }

    return userStore.nickname ? `${userStore.nickname} · 默认喜欢歌单` : '默认喜欢歌单'
  })
  const heroKicker = computed(() => (isAlbumsSectionActive.value ? '专辑' : '歌单'))
  const primaryActionLabel = computed(() => (isAlbumsSectionActive.value ? '播放专辑' : '播放全部'))
  const primaryActionDisabled = computed(() =>
    isAlbumsSectionActive.value
      ? albumsLoading.value || filteredAlbums.value.length === 0
      : loading.value || filteredSongs.value.length === 0
  )
  const songsErrorMessage = computed(() =>
    resolvePanelErrorMessage(error.value, '喜欢的音乐加载失败，请稍后重试。')
  )
  const albumsErrorMessage = computed(() =>
    resolvePanelErrorMessage(albumsError.value, '收藏专辑加载失败，请稍后重试。')
  )
  const currentSongId = computed(() => playerStore.currentSong?.id ?? null)
  const shouldShowLoginGate = computed(
    () =>
      !userStore.isLoggedIn && localPlaybackSongs.value.length === 0 && isSongsSectionActive.value
  )
  const shouldShowAlbumsLoginGate = computed(
    () => !userStore.isLoggedIn && isAlbumsSectionActive.value
  )

  async function ensureAllLocalSongsLoaded(): Promise<void> {
    if (loadAllLocalSongsPromise) {
      return loadAllLocalSongsPromise
    }

    loadAllLocalSongsPromise = (async () => {
      if (!localLibraryState.value.supported || localLibraryStatus.value.discoveredTracks <= 0) {
        return
      }

      if (localSongsPage.value.items.length === 0) {
        await loadLocalTracks()
      }

      while (localSongsPage.value.nextCursor) {
        await loadLocalTracks({}, true)
      }
    })().finally(() => {
      loadAllLocalSongsPromise = null
    })

    return loadAllLocalSongsPromise
  }

  watch(
    () => [userStore.isLoggedIn, userStore.userId] as const,
    ([isLoggedIn, userId]) => {
      if (isLoggedIn && userId !== null && userId !== undefined && userId !== '') {
        void loadLikedSongs(userId)
        void loadFavoriteAlbums(userId)
        return
      }

      resetLikedSongs()
      resetFavoriteAlbums()
      resetAlbumDetailState()
    },
    { immediate: true }
  )

  watch(
    () =>
      [
        localLibraryState.value.supported,
        localLibraryStatus.value.discoveredTracks,
        localSongsPage.value.items.length,
        localSongsPage.value.nextCursor
      ] as const,
    ([supported, discoveredTracks, loadedCount, nextCursor]) => {
      if (!supported || discoveredTracks <= 0) {
        return
      }

      if (loadedCount === 0 || nextCursor || loadedCount < discoveredTracks) {
        void ensureAllLocalSongsLoaded()
      }
    },
    { immediate: true }
  )

  function resetAlbumDetailState(): void {
    activeAlbumDetailLoadId += 1
    activeAlbumPlayId += 1
    albumSongsCache.clear()
    selectedAlbumId.value = null
    selectedAlbumSongs.value = []
    albumDetailLoading.value = false
    albumDetailError.value = null
    playingAlbumId.value = null
  }

  function selectSection(section: LikedContentSection): void {
    if (activeSection.value === section) {
      return
    }

    activeSection.value = section
    searchQuery.value = ''

    if (
      section === 'albums' &&
      userStore.isLoggedIn &&
      userStore.userId &&
      !albumsLoading.value &&
      albums.value.length === 0
    ) {
      void loadFavoriteAlbums(userStore.userId)
    }
  }

  async function playLikedSongsAt(index: number): Promise<void> {
    if (loading.value || filteredSongs.value.length === 0) {
      return
    }

    const selection = buildPlaybackSelection(filteredSongs.value, likeSongs.value, index)
    if (!selection) {
      return
    }

    await playMediaSongSelection(
      playerStore,
      toastStore,
      selection.songs,
      selection.playbackIndex,
      '播放喜欢的音乐时发生错误。'
    )
  }

  async function loadAlbumDetail(albumId: string | number, force = false): Promise<Song[]> {
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
    } catch (requestError) {
      if (loadId !== activeAlbumDetailLoadId || selectedAlbumId.value !== normalizedAlbumId) {
        return []
      }

      selectedAlbumSongs.value = []
      albumDetailError.value = requestError
      throw requestError
    } finally {
      if (loadId === activeAlbumDetailLoadId) {
        albumDetailLoading.value = false
      }
    }
  }

  async function openAlbumDetail(albumId: string | number): Promise<void> {
    const normalizedAlbumId = String(albumId)
    selectedAlbumId.value = normalizedAlbumId
    selectedAlbumSongs.value = []
    albumDetailError.value = null

    try {
      await loadAlbumDetail(albumId)
    } catch {
      // Error state is committed in loadAlbumDetail.
    }
  }

  function closeAlbumDetail(): void {
    activeAlbumDetailLoadId += 1
    selectedAlbumId.value = null
    selectedAlbumSongs.value = []
    albumDetailLoading.value = false
    albumDetailError.value = null
  }

  async function retryAlbumDetail(): Promise<void> {
    if (!selectedAlbumId.value) {
      return
    }

    try {
      await loadAlbumDetail(selectedAlbum.value?.id ?? selectedAlbumId.value, true)
    } catch {
      // Error state is committed in loadAlbumDetail.
    }
  }

  async function playAlbum(albumId: string | number): Promise<void> {
    const normalizedAlbumId = String(albumId)
    const playId = ++activeAlbumPlayId
    playingAlbumId.value = normalizedAlbumId

    try {
      if (selectedAlbumId.value !== normalizedAlbumId) {
        selectedAlbumId.value = normalizedAlbumId
      }

      const songs = await loadAlbumDetail(albumId)
      if (playId !== activeAlbumPlayId || playingAlbumId.value !== normalizedAlbumId) {
        return
      }

      await playMediaSongSelection(playerStore, toastStore, songs, 0, '播放专辑时发生错误。')
    } catch {
      // Error state is committed in loadAlbumDetail or playMediaSongSelection.
    } finally {
      if (playId === activeAlbumPlayId && playingAlbumId.value === normalizedAlbumId) {
        playingAlbumId.value = null
      }
    }
  }

  async function playAlbumTrackAt(index: number): Promise<void> {
    await playMediaSongSelection(
      playerStore,
      toastStore,
      selectedAlbumSongs.value,
      index,
      '播放专辑时发生错误。'
    )
  }

  function retryLoadAlbums(): void {
    if (!userStore.userId) {
      return
    }

    void loadFavoriteAlbums(userStore.userId)
  }

  function clearSearch(): void {
    searchQuery.value = ''
  }

  function handlePrimaryAction(): void {
    if (isAlbumsSectionActive.value) {
      const targetAlbum = selectedAlbum.value ?? filteredAlbums.value[0] ?? albums.value[0]
      if (!targetAlbum) {
        return
      }

      void playAlbum(targetAlbum.id)
      return
    }

    void playLikedSongsAt(0)
  }

  return {
    activeSection,
    albumCount,
    albumDetailError,
    albumDetailLoading,
    albums,
    albumsError,
    albumsErrorMessage,
    albumsLoading,
    clearSearch,
    closeAlbumDetail,
    count,
    coverUrl,
    currentSongId,
    error,
    filteredAlbums,
    filteredSongs,
    filteredPlaybackSongs,
    handlePrimaryAction,
    hasMore,
    heroKicker,
    isAlbumsSectionActive,
    isSongsSectionActive,
    loadMoreLikedSongs,
    loading,
    loadingMore,
    mediaSongs,
    openAlbumDetail,
    playAlbum,
    playAlbumTrackAt,
    playLikedSongsAt,
    playingAlbumId,
    primaryActionDisabled,
    primaryActionLabel,
    retryAlbumDetail,
    retryLoadAlbums,
    retryLoadLikedSongs,
    searchQuery,
    selectSection,
    selectedAlbum,
    selectedAlbumId,
    selectedAlbumSongs,
    shouldShowAlbumsLoginGate,
    shouldShowLoginGate,
    songsErrorMessage,
    totalSongCountLabel,
    userMetaLabel,
    userStore
  }
}

export type HomeLikedSongsPanelModel = ReturnType<typeof useHomeLikedSongsPanel>
