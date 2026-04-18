import { computed, ref } from 'vue'

import { usePlayerStore } from '@/store/playerStore'
import { useRecentPlayStore } from '@/store/recentPlayStore'
import { useToastStore } from '@/store/toastStore'
import { getSongPlatformKey, isSameSongIdentity } from '@/utils/songIdentity'

import {
  createHomeMediaSong,
  filterMediaSongsByQuery,
  playMediaSongSelection,
  type HomeMediaSongItem
} from './mediaPanelShared'

type HomeRecentPlayDisplayItem = HomeMediaSongItem & {
  identityKey: string
  playedAt: number
  song: ReturnType<typeof useRecentPlayStore>['items'][number]['song']
}

export function useHomeRecentPlayPanel() {
  const playerStore = usePlayerStore()
  const recentPlayStore = useRecentPlayStore()
  const toastStore = useToastStore()

  const searchQuery = ref('')

  const recentItems = computed<HomeRecentPlayDisplayItem[]>(() =>
    recentPlayStore.items.map(item => ({
      ...createHomeMediaSong(item.song),
      identityKey: `${getSongPlatformKey(item.song)}:${String(item.song.id)}`,
      playedAt: item.playedAt,
      song: item.song
    }))
  )
  const filteredItems = computed(() =>
    filterMediaSongsByQuery(recentItems.value, searchQuery.value)
  )
  const totalCount = computed(() => recentPlayStore.items.length)
  const lastPlayedAt = computed(() => recentPlayStore.items[0]?.playedAt ?? null)
  const hasRecentSongs = computed(() => totalCount.value > 0)

  function clearSearch(): void {
    searchQuery.value = ''
  }

  function isCurrentSong(song: HomeRecentPlayDisplayItem['song']): boolean {
    return isSameSongIdentity(playerStore.currentSong, song)
  }

  async function playRecentSongAt(index: number): Promise<void> {
    const playbackSongs = filteredItems.value.map(item => item.song)
    await playMediaSongSelection(
      playerStore,
      toastStore,
      playbackSongs,
      index,
      'Failed to play recent track'
    )
  }

  async function playAllRecentSongs(): Promise<void> {
    await playRecentSongAt(0)
  }

  function clearRecentSongs(): void {
    recentPlayStore.clear()
  }

  function removeRecentSong(song: HomeRecentPlayDisplayItem['song']): void {
    recentPlayStore.removeSong(song)
  }

  return {
    clearRecentSongs,
    clearSearch,
    filteredItems,
    hasRecentSongs,
    isCurrentSong,
    lastPlayedAt,
    playAllRecentSongs,
    playRecentSongAt,
    removeRecentSong,
    searchQuery,
    totalCount
  }
}
