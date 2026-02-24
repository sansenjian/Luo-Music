import { ref, computed } from 'vue'
import { getUserPlaylist, getPlaylistDetail } from '../api/playlist'
import { formatSongs } from '../utils/songFormatter'

export function useUserPlaylists() {
  const playlists = ref([])
  const loading = ref(false)
  const error = ref(null)

  const count = computed(() => playlists.value.length)

  const loadPlaylists = async (userId) => {
    if (!userId) return
    
    loading.value = true
    error.value = null
    
    try {
      const res = await getUserPlaylist(userId)
      if (res?.playlist) {
        playlists.value = res.playlist
      }
    } catch (e) {
      console.error('获取歌单失败:', e)
      error.value = e
    } finally {
      loading.value = false
    }
  }

  const loadPlaylistSongs = async (playlistId) => {
    try {
      const res = await getPlaylistDetail(playlistId)
      if (res?.playlist?.tracks) {
        return formatSongs(res.playlist.tracks)
      }
      return []
    } catch (e) {
      console.error('获取歌单详情失败:', e)
      return []
    }
  }

  return {
    playlists,
    count,
    loading,
    error,
    loadPlaylists,
    loadPlaylistSongs,
  }
}
