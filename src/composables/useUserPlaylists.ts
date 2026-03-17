import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getPlaylistDetail, getUserPlaylist } from '../api/playlist'
import type { Song } from '../platform/music/interface'

export interface PlaylistItem {
  id: string | number
  name: string
  [key: string]: unknown
}

export interface UseUserPlaylistsReturn {
  playlists: Ref<PlaylistItem[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  error: Ref<unknown>
  loadPlaylists: (userId: string | number) => Promise<void>
  loadPlaylistSongs: (playlistId: string | number) => Promise<Song[]>
}

export function useUserPlaylists(): UseUserPlaylistsReturn {
  const playlists = ref<PlaylistItem[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const count = computed(() => playlists.value.length)

  const loadPlaylists = async (userId: string | number): Promise<void> => {
    if (!userId) {
      return
    }

    loading.value = true
    error.value = null

    try {
      const response = (await getUserPlaylist(Number(userId))) as { playlist?: PlaylistItem[] }
      playlists.value = response.playlist ?? []
    } catch (requestError) {
      console.error('获取歌单失败:', requestError)
      error.value = requestError
    } finally {
      loading.value = false
    }
  }

  const loadPlaylistSongs = async (playlistId: string | number): Promise<Song[]> => {
    try {
      const response = (await getPlaylistDetail(Number(playlistId))) as {
        playlist?: {
          tracks?: Song[]
        }
      }
      return response.playlist?.tracks ?? []
    } catch (requestError) {
      console.error('获取歌单详情失败:', requestError)
      return []
    }
  }

  return {
    playlists,
    count,
    loading,
    error,
    loadPlaylists,
    loadPlaylistSongs
  }
}
