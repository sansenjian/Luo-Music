import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import type { Song } from '@/platform/music/interface'
import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import { useLikedSongs } from '@/composables/useLikedSongs'
import { useUserPlaylists } from '@/composables/useUserPlaylists'
import {
  removeSongFromLocalPlaylist,
  useLocalPlaylistStore,
  type RemoveSongFromLocalPlaylistResult
} from '@/store/localPlaylistStore'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'

import type { HomeSidebarCollectionSelection } from '@/features/home/components/homeSidebar.types'

import {
  buildPlaybackSelection,
  createHomeMediaSong,
  filterMediaSongsByQuery,
  playMediaSongSelection,
  resolvePanelErrorMessage
} from './mediaPanelShared'

export function useHomeCollectionPanel(
  collectionSource: MaybeRefOrGetter<HomeSidebarCollectionSelection | null>
) {
  const userStore = useUserStore()
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
  const localPlaylistStore = useLocalPlaylistStore()
  const { usePlaylistTracks } = useUserPlaylists()
  const { loadAlbumSongs } = useFavoriteAlbums()
  const {
    likeSongs,
    hasMore: likedSongsHasMore,
    loading: likedSongsLoading,
    loadingMore: likedSongsLoadingMore,
    error: likedSongsError,
    loadLikedSongs,
    loadMoreLikedSongs,
    resetLikedSongs
  } = useLikedSongs()

  const {
    songs: playlistSongs,
    hasMore,
    loading,
    loadingMore,
    error,
    loadFirstPage,
    loadMore,
    reset
  } = usePlaylistTracks()
  const albumSongs = ref<Song[]>([])
  const albumLoading = ref(false)
  const albumError = ref<unknown>(null)
  const requestVersion = ref(0)
  const searchQuery = ref('')

  const collection = computed(() => toValue(collectionSource))
  const isLikedCollection = computed(() => collection.value?.kind === 'liked')
  const isPlaylistCollection = computed(() => collection.value?.kind === 'playlist')
  const isLocalPlaylistCollection = computed(() => collection.value?.kind === 'localPlaylist')
  const localPlaylist = computed(() => {
    const nextCollection = collection.value
    if (!nextCollection || nextCollection.kind !== 'localPlaylist') {
      return null
    }

    return localPlaylistStore.getPlaylistById(String(nextCollection.sourceId))
  })
  const songs = computed(() => {
    if (isLikedCollection.value) {
      return likeSongs.value
    }

    if (isLocalPlaylistCollection.value) {
      return localPlaylist.value?.songs ?? []
    }

    return isPlaylistCollection.value ? playlistSongs.value : albumSongs.value
  })
  const title = computed(() => collection.value?.name ?? '已选择歌单')
  const kicker = computed(() =>
    collection.value?.kind === 'album'
      ? '收藏专辑'
      : isLocalPlaylistCollection.value
        ? '本地歌单'
        : isLikedCollection.value
          ? '喜欢的音乐'
          : '歌单'
  )
  const metaLabel = computed(() => {
    if (!collection.value) {
      return ''
    }

    if (collection.value.kind === 'album') {
      return collection.value.summary
    }

    if (isLikedCollection.value) {
      return userStore.nickname
        ? `${userStore.nickname} · ${collection.value.summary}`
        : collection.value.summary
    }

    if (isLocalPlaylistCollection.value) {
      return collection.value.summary
    }

    return userStore.nickname
      ? `${userStore.nickname} · ${collection.value.summary}`
      : collection.value.summary
  })
  const coverUrl = computed(() => {
    if (isLikedCollection.value) {
      return songs.value[0]?.album?.picUrl || collection.value?.coverUrl || ''
    }

    if (isLocalPlaylistCollection.value) {
      return localPlaylist.value?.coverUrl || songs.value[0]?.album?.picUrl || ''
    }

    return collection.value?.coverUrl || ''
  })
  const currentSongId = computed(() => playerStore.currentSong?.id ?? null)
  const errorMessage = computed(() =>
    resolvePanelErrorMessage(
      isLikedCollection.value
        ? likedSongsError.value
        : isLocalPlaylistCollection.value
          ? null
          : isPlaylistCollection.value
            ? error.value
            : albumError.value,
      '详情加载失败，请稍后重试。'
    )
  )
  const formattedSongs = computed(() =>
    songs.value.map(song => createHomeMediaSong(song, coverUrl.value))
  )
  const filteredSongs = computed(() =>
    filterMediaSongsByQuery(formattedSongs.value, searchQuery.value)
  )
  const filteredPlaybackSongs = computed<Song[]>(() => {
    const sourceSongsById = new Map(songs.value.map(song => [song.id, song]))
    return filteredSongs.value
      .map(song => sourceSongsById.get(song.id))
      .filter((song): song is Song => Boolean(song))
  })

  watch(
    () => collection.value?.uiId ?? null,
    () => {
      searchQuery.value = ''
      void loadCollectionSongs()
    },
    { immediate: true }
  )

  watch(
    () => [isLikedCollection.value, userStore.isLoggedIn, userStore.userId] as const,
    ([isLiked]) => {
      if (!isLiked) {
        return
      }

      searchQuery.value = ''
      void loadCollectionSongs()
    }
  )

  async function loadCollectionSongs(): Promise<void> {
    const nextCollection = collection.value
    reset()
    resetLikedSongs()
    albumSongs.value = []
    albumError.value = null
    albumLoading.value = false

    if (!nextCollection) {
      return
    }

    const currentRequest = requestVersion.value + 1
    requestVersion.value = currentRequest

    if (nextCollection.kind === 'liked') {
      if (!userStore.userId) {
        return
      }

      await loadLikedSongs(userStore.userId)
      return
    }

    if (nextCollection.kind === 'playlist') {
      try {
        await loadFirstPage(nextCollection.sourceId)
      } catch {
        // Playlist track state keeps its own error ref.
      }

      return
    }

    if (nextCollection.kind === 'localPlaylist') {
      return
    }

    albumLoading.value = true

    try {
      const nextSongs = await loadAlbumSongs(nextCollection.sourceId)

      if (requestVersion.value !== currentRequest) {
        return
      }

      albumSongs.value = nextSongs
    } catch (requestError) {
      if (requestVersion.value !== currentRequest) {
        return
      }

      albumSongs.value = []
      albumError.value = requestError
    } finally {
      if (requestVersion.value === currentRequest) {
        albumLoading.value = false
      }
    }
  }

  async function loadMoreCollectionSongs(): Promise<void> {
    if (isLikedCollection.value) {
      if (likedSongsLoading.value || likedSongsLoadingMore.value || !likedSongsHasMore.value) {
        return
      }

      await loadMoreLikedSongs()
      return
    }

    if (
      isLocalPlaylistCollection.value ||
      !isPlaylistCollection.value ||
      loading.value ||
      loadingMore.value ||
      !hasMore.value
    ) {
      return
    }

    await loadMore()
  }

  async function playCollectionAt(index: number): Promise<void> {
    if (filteredSongs.value.length === 0) {
      return
    }

    const selection = buildPlaybackSelection(filteredSongs.value, songs.value, index)
    if (!selection) {
      return
    }

    await playMediaSongSelection(
      playerStore,
      toastStore,
      selection.songs,
      selection.playbackIndex,
      '播放歌单详情时发生错误。'
    )
  }

  function clearSearch(): void {
    searchQuery.value = ''
  }

  function playAll(): void {
    void playCollectionAt(0)
  }

  function removeSongFromCurrentLocalPlaylist(song: Song): RemoveSongFromLocalPlaylistResult {
    const playlist = localPlaylist.value
    if (!playlist) {
      throw new Error('找不到该本地歌单')
    }

    const runtimeStore = localPlaylistStore as {
      removeSongFromPlaylist?: unknown
    }

    if (typeof runtimeStore.removeSongFromPlaylist === 'function') {
      return localPlaylistStore.removeSongFromPlaylist(playlist.id, song)
    }

    return removeSongFromLocalPlaylist(playlist, song)
  }

  function removeLocalPlaylistSong(song: Song): void {
    if (!isLocalPlaylistCollection.value) {
      return
    }

    try {
      const { playlist, removed } = removeSongFromCurrentLocalPlaylist(song)
      if (!removed) {
        toastStore.info(`「${song.name}」已不在「${playlist.name}」中`)
        return
      }

      toastStore.success(`已从本地歌单「${playlist.name}」移除`)
    } catch (requestError) {
      toastStore.error(resolvePanelErrorMessage(requestError, '从本地歌单移除失败'))
    }
  }

  return {
    clearSearch,
    collection,
    coverUrl,
    currentSongId,
    error: computed(() =>
      isLikedCollection.value
        ? likedSongsError.value
        : isLocalPlaylistCollection.value
          ? null
          : isPlaylistCollection.value
            ? error.value
            : albumError.value
    ),
    errorMessage,
    filteredSongs,
    filteredPlaybackSongs,
    hasMore: computed(() =>
      isLikedCollection.value
        ? likedSongsHasMore.value
        : isLocalPlaylistCollection.value
          ? false
          : hasMore.value
    ),
    kicker,
    loadCollectionSongs,
    loadMoreCollectionSongs,
    loading: computed(() =>
      isLikedCollection.value
        ? likedSongsLoading.value
        : isLocalPlaylistCollection.value
          ? false
          : isPlaylistCollection.value
            ? loading.value
            : albumLoading.value
    ),
    loadingMore: computed(() =>
      isLikedCollection.value
        ? likedSongsLoadingMore.value
        : isLocalPlaylistCollection.value
          ? false
          : loadingMore.value
    ),
    metaLabel,
    playAll,
    playCollectionAt,
    removeLocalPlaylistSong,
    searchQuery,
    songs,
    title,
    isLocalPlaylistCollection,
    userStore
  }
}
