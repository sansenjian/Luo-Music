import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getPlaylistDetail, getUserPlaylist } from '../api/playlist'
import type { Song } from '../platform/music/interface'
import { isCanceledRequestError } from '../utils/http/cancelError'
import { createLatestRequestController } from '../utils/http/requestScope'

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
  resetPlaylists: () => void
  loadPlaylists: (userId: string | number) => Promise<void>
  loadPlaylistSongs: (playlistId: string | number) => Promise<Song[]>
}

export function useUserPlaylists(): UseUserPlaylistsReturn {
  const playlists = ref<PlaylistItem[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const count = computed(() => playlists.value.length)
  const requestController = createLatestRequestController()

  const resetPlaylists = (): void => {
    requestController.cancel()
    playlists.value = []
    loading.value = false
    error.value = null
  }

  const loadPlaylists = async (userId: string | number): Promise<void> => {
    const task = requestController.start()

    if (!userId) {
      task.commit(() => {
        playlists.value = []
        loading.value = false
      })
      return
    }

    loading.value = true
    error.value = null

    try {
      const response = (await task.guard(getUserPlaylist(Number(userId)))) as {
        playlist?: PlaylistItem[]
      }

      task.commit(() => {
        playlists.value = response.playlist ?? []
      })
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load user playlists:', requestError)
      task.commit(() => {
        error.value = requestError
      })
    } finally {
      task.commit(() => {
        loading.value = false
      })
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
      console.error('Failed to load playlist detail:', requestError)
      return []
    }
  }

  return {
    playlists,
    count,
    loading,
    error,
    resetPlaylists,
    loadPlaylists,
    loadPlaylistSongs
  }
}
