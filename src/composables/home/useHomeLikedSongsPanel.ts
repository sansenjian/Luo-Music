import { computed, ref, watch } from 'vue'

import { useLikedSongs } from '@/composables/useLikedSongs'
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

export function useHomeLikedSongsPanel() {
  const userStore = useUserStore()
  const playerStore = usePlayerStore()
  const toastStore = useToastStore()
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

  const searchQuery = ref('')

  const mediaSongs = computed(() => likeSongs.value.map(song => createHomeMediaSong(song)))
  const filteredSongs = computed(() => filterMediaSongsByQuery(mediaSongs.value, searchQuery.value))
  const coverUrl = computed(() => filteredSongs.value[0]?.cover || mediaSongs.value[0]?.cover || '')
  const totalSongCountLabel = computed(() => `${count.value} 首歌曲`)
  const userMetaLabel = computed(() =>
    userStore.nickname ? `${userStore.nickname} · 默认喜欢歌单` : '默认喜欢歌单'
  )
  const errorMessage = computed(() =>
    resolvePanelErrorMessage(error.value, '喜欢的音乐加载失败，请稍后重试。')
  )
  const currentSongId = computed(() => playerStore.currentSong?.id ?? null)

  watch(
    () => [userStore.isLoggedIn, userStore.userId] as const,
    ([isLoggedIn, userId]) => {
      if (isLoggedIn && userId !== null && userId !== undefined && userId !== '') {
        void loadLikedSongs(userId)
        return
      }

      resetLikedSongs()
    },
    { immediate: true }
  )

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

  function clearSearch(): void {
    searchQuery.value = ''
  }

  function handlePlayAll(): void {
    void playLikedSongsAt(0)
  }

  return {
    clearSearch,
    count,
    coverUrl,
    currentSongId,
    error,
    errorMessage,
    filteredSongs,
    handlePlayAll,
    hasMore,
    loadMoreLikedSongs,
    loading,
    loadingMore,
    mediaSongs,
    playLikedSongsAt,
    retryLoadLikedSongs,
    searchQuery,
    totalSongCountLabel,
    userMetaLabel,
    userStore
  }
}
