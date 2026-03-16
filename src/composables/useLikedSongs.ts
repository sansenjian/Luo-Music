import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getLikelist, getSongDetail } from '../api/song'
import type { Song } from '../platform/music/interface'
import { formatSongs, type FormattedSong } from '../utils/songFormatter'

interface LikeListResponse {
  ids?: Array<string | number>
}

interface SongDetailResponse {
  songs?: Song[]
}

export interface UseLikedSongsReturn {
  likeSongs: Ref<Song[]>
  formattedSongs: ComputedRef<FormattedSong[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  error: Ref<unknown>
  loadLikedSongs: (userId: string | number) => Promise<void>
}

export function useLikedSongs(): UseLikedSongsReturn {
  const likeSongs = ref<Song[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)

  const formattedSongs = computed(() => formatSongs(likeSongs.value))
  const count = computed(() => likeSongs.value.length)

  const loadLikedSongs = async (userId: string | number): Promise<void> => {
    if (!userId) {
      return
    }

    loading.value = true
    error.value = null

    try {
      const likeList = (await getLikelist(Number(userId))) as LikeListResponse

      if (!likeList.ids?.length) {
        likeSongs.value = []
        return
      }

      const ids = likeList.ids.slice(0, 100)
      const detail = (await getSongDetail(ids.join(','))) as SongDetailResponse
      const songs = detail.songs ?? []
      const songMap = new Map(songs.map(song => [song.id, song]))

      likeSongs.value = ids.map(id => songMap.get(id)).filter((song): song is Song => Boolean(song))
    } catch (requestError) {
      console.error('获取喜欢歌曲失败:', requestError)
      error.value = requestError
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
    loadLikedSongs
  }
}
