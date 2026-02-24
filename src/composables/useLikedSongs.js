import { ref, computed } from 'vue'
import { getLikelist, getSongDetail } from '../api/song'
import { formatSongs } from '../utils/songFormatter'

export function useLikedSongs() {
  const likeSongs = ref([])
  const loading = ref(false)
  const error = ref(null)

  const formattedSongs = computed(() => formatSongs(likeSongs.value))
  const count = computed(() => likeSongs.value.length)

  const loadLikedSongs = async (userId) => {
    if (!userId) return
    
    loading.value = true
    error.value = null
    
    try {
      const res = await getLikelist(userId)
      if (res?.ids?.length > 0) {
        const ids = res.ids.slice(0, 100)
        const detailRes = await getSongDetail(ids.join(','))
        if (detailRes?.songs) {
          const songMap = new Map(detailRes.songs.map(s => [s.id, s]))
          likeSongs.value = ids.map(id => songMap.get(id)).filter(Boolean)
        }
      } else {
        likeSongs.value = []
      }
    } catch (e) {
      console.error('获取喜欢歌曲失败:', e)
      error.value = e
      likeSongs.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    likeSongs,
    formattedSongs,
    count,
    loading,
    error,
    loadLikedSongs,
  }
}
