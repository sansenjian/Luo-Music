import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import type { Song } from '@/platform/music/interface'
import { useFavoriteAlbums } from '@/composables/useFavoriteAlbums'
import { useUserPlaylists } from '@/composables/useUserPlaylists'
import { usePlayerStore } from '@/store/playerStore'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'

import type { HomeSidebarCollectionSelection } from '@/components/home/homeSidebar.types'

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
  const { loadPlaylistSongs } = useUserPlaylists()
  const { loadAlbumSongs } = useFavoriteAlbums()

  const songs = ref<Song[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const requestVersion = ref(0)
  const searchQuery = ref('')

  const collection = computed(() => toValue(collectionSource))
  const title = computed(() => collection.value?.name ?? '已选择歌单')
  const kicker = computed(() => (collection.value?.kind === 'album' ? '收藏专辑' : '歌单'))
  const metaLabel = computed(() => {
    if (!collection.value) {
      return ''
    }

    if (collection.value.kind === 'album') {
      return collection.value.summary
    }

    return userStore.nickname
      ? `${userStore.nickname} · ${collection.value.summary}`
      : collection.value.summary
  })
  const coverUrl = computed(() => collection.value?.coverUrl || '')
  const currentSongId = computed(() => playerStore.currentSong?.id ?? null)
  const errorMessage = computed(() =>
    resolvePanelErrorMessage(error.value, '详情加载失败，请稍后重试。')
  )
  const formattedSongs = computed(() =>
    songs.value.map(song => createHomeMediaSong(song, coverUrl.value))
  )
  const filteredSongs = computed(() =>
    filterMediaSongsByQuery(formattedSongs.value, searchQuery.value)
  )

  watch(
    () => collection.value?.uiId ?? null,
    () => {
      searchQuery.value = ''
      void loadCollectionSongs()
    },
    { immediate: true }
  )

  async function loadCollectionSongs(): Promise<void> {
    const nextCollection = collection.value
    if (!nextCollection) {
      songs.value = []
      error.value = null
      loading.value = false
      return
    }

    const currentRequest = requestVersion.value + 1
    requestVersion.value = currentRequest
    loading.value = true
    error.value = null

    try {
      const nextSongs =
        nextCollection.kind === 'album'
          ? await loadAlbumSongs(nextCollection.sourceId)
          : await loadPlaylistSongs(nextCollection.sourceId)

      if (requestVersion.value !== currentRequest) {
        return
      }

      songs.value = nextSongs
    } catch (requestError) {
      if (requestVersion.value !== currentRequest) {
        return
      }

      songs.value = []
      error.value = requestError
    } finally {
      if (requestVersion.value === currentRequest) {
        loading.value = false
      }
    }
  }

  async function playCollectionAt(index: number): Promise<void> {
    if (loading.value || filteredSongs.value.length === 0) {
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

  return {
    clearSearch,
    collection,
    coverUrl,
    currentSongId,
    error,
    errorMessage,
    filteredSongs,
    kicker,
    loadCollectionSongs,
    loading,
    metaLabel,
    playAll,
    playCollectionAt,
    searchQuery,
    songs,
    title,
    userStore
  }
}
