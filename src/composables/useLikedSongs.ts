import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getLikelist, getSongDetail } from '../api/song'
import type { Song } from '../platform/music/interface'
import { isCanceledRequestError } from '../utils/http/cancelError'
import { createLatestRequestController } from '../utils/http/requestScope'
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
  resetLikedSongs: () => void
  loadLikedSongs: (userId: string | number) => Promise<void>
}

export function useLikedSongs(): UseLikedSongsReturn {
  const likeSongs = ref<Song[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const requestController = createLatestRequestController()

  const formattedSongs = computed(() => formatSongs(likeSongs.value))
  const count = computed(() => likeSongs.value.length)

  const resetLikedSongs = (): void => {
    requestController.cancel()
    likeSongs.value = []
    loading.value = false
    error.value = null
  }

  const loadLikedSongs = async (userId: string | number): Promise<void> => {
    const task = requestController.start()

    if (!userId) {
      task.commit(() => {
        likeSongs.value = []
        loading.value = false
      })
      return
    }

    loading.value = true
    error.value = null

    try {
      const likeList = (await task.guard(getLikelist(Number(userId)))) as LikeListResponse

      if (!likeList.ids?.length) {
        task.commit(() => {
          likeSongs.value = []
        })
        return
      }

      const ids = likeList.ids.slice(0, 100)
      const detail = (await task.guard(getSongDetail(ids.join(',')))) as SongDetailResponse
      const songs = detail.songs ?? []
      const songMap = new Map(songs.map(song => [song.id, song]))

      task.commit(() => {
        likeSongs.value = ids
          .map(id => songMap.get(id))
          .filter((song): song is Song => Boolean(song))
      })
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load liked songs:', requestError)
      task.commit(() => {
        error.value = requestError
        likeSongs.value = []
      })
    } finally {
      task.commit(() => {
        loading.value = false
      })
    }
  }

  return {
    likeSongs,
    formattedSongs,
    count,
    loading,
    error,
    resetLikedSongs,
    loadLikedSongs
  }
}
