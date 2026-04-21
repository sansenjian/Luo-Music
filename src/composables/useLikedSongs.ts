import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'

import { getLikelist, getSongDetail } from '../api/song'
import { createSong, type Song } from '../platform/music/interface'
import { isCanceledRequestError } from '../utils/http/cancelError'
import { createLatestRequestController } from '../utils/http/requestScope'
import { formatSongs, type FormattedSong } from '../utils/songFormatter'

interface LikeListResponse {
  ids?: Array<string | number>
}

interface SongDetailResponse {
  songs?: RawLikedSong[]
}

interface RawLikedSongArtist {
  id?: string | number
  name?: string
}

interface RawLikedSongAlbum {
  id?: string | number
  name?: string
  picUrl?: string
  artist?: {
    img1v1Url?: string
  }
}

interface RawLikedSong {
  id?: string | number
  name?: string
  artists?: RawLikedSongArtist[]
  ar?: RawLikedSongArtist[]
  album?: RawLikedSongAlbum
  al?: RawLikedSongAlbum
  duration?: number
  dt?: number
  mvid?: string | number
  mv?: string | number
  platform?: Song['platform']
  server?: Song['platform']
  originalId?: string | number
  url?: string
  mediaId?: string | number
  extra?: Record<string, unknown>
}

const LIKED_SONGS_INITIAL_PAGE_SIZE = 30
const LIKED_SONGS_PAGE_SIZE = 100

function normalizeLikedSong(song: RawLikedSong): Song | null {
  if (song.id === undefined || !song.name) {
    return null
  }

  const artistsSource = Array.isArray(song.artists)
    ? song.artists
    : Array.isArray(song.ar)
      ? song.ar
      : []
  const albumSource = song.album ?? song.al

  return createSong({
    id: song.id,
    name: song.name,
    artists: artistsSource.map(artist => ({
      id: artist.id ?? 0,
      name: artist.name ?? ''
    })),
    album: {
      id: albumSource?.id ?? 0,
      name: albumSource?.name ?? '',
      picUrl: albumSource?.picUrl ?? albumSource?.artist?.img1v1Url ?? ''
    },
    duration: song.duration ?? song.dt ?? 0,
    mvid: song.mvid ?? song.mv ?? 0,
    platform:
      song.platform === 'qq' || song.server === 'qq'
        ? 'qq'
        : song.platform === 'netease'
          ? 'netease'
          : 'netease',
    originalId: song.originalId ?? song.id,
    ...(song.url ? { url: song.url } : {}),
    ...(song.mediaId !== undefined ? { mediaId: song.mediaId } : {}),
    ...(song.extra ? { extra: song.extra } : {})
  })
}

export interface UseLikedSongsReturn {
  likeSongs: Ref<Song[]>
  hasMore: ComputedRef<boolean>
  allLoaded: ComputedRef<boolean>
  formattedSongs: ComputedRef<FormattedSong[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  loadingMore: Ref<boolean>
  error: Ref<unknown>
  resetLikedSongs: () => void
  loadLikedSongs: (userId: string | number) => Promise<void>
  loadMoreLikedSongs: () => Promise<void>
  loadAllRemaining: () => Promise<void>
  retryLoadLikedSongs: () => Promise<void>
}

export function useLikedSongs(): UseLikedSongsReturn {
  const likeSongs = shallowRef<Song[]>([])
  const likedSongIds = ref<Array<string | number>>([])
  const lastRequestedUserId = ref<string | number | null>(null)
  const nextOffset = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<unknown>(null)
  const idsRequestController = createLatestRequestController()
  const detailRequestController = createLatestRequestController()
  let activeSessionId = 0

  const formattedSongs = computed(() => formatSongs(likeSongs.value))
  const count = computed(() => likedSongIds.value.length)
  const hasMore = computed(() => nextOffset.value < likedSongIds.value.length)
  const allLoaded = computed(
    () => nextOffset.value >= likedSongIds.value.length && likedSongIds.value.length > 0
  )

  const buildSongsFromDetail = (
    ids: Array<string | number>,
    detail: SongDetailResponse
  ): Song[] => {
    const songs = (detail.songs ?? [])
      .map(song => normalizeLikedSong(song))
      .filter((song): song is Song => Boolean(song))
    const songMap = new Map(songs.map(song => [song.id, song]))

    return ids.map(id => songMap.get(id)).filter((song): song is Song => Boolean(song))
  }

  const resetLikedSongs = (): void => {
    idsRequestController.cancel()
    detailRequestController.cancel()
    activeSessionId += 1
    likedSongIds.value = []
    lastRequestedUserId.value = null
    likeSongs.value = []
    nextOffset.value = 0
    loading.value = false
    loadingMore.value = false
    error.value = null
  }

  const loadSongPage = async (offset: number, append: boolean): Promise<void> => {
    const pageSize = append ? LIKED_SONGS_PAGE_SIZE : LIKED_SONGS_INITIAL_PAGE_SIZE
    const ids = likedSongIds.value.slice(offset, offset + pageSize)
    if (ids.length === 0) {
      return
    }

    const sessionId = activeSessionId
    const task = detailRequestController.start()

    if (append) {
      loadingMore.value = true
    }

    error.value = null

    try {
      const detail = (await task.guard(getSongDetail(ids.join(',')))) as SongDetailResponse
      const pageSongs = buildSongsFromDetail(ids, detail)

      task.commit(() => {
        if (sessionId !== activeSessionId) {
          return
        }

        likeSongs.value = append ? [...likeSongs.value, ...pageSongs] : pageSongs
        nextOffset.value = offset + ids.length
      })
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load liked songs detail:', requestError)
      task.commit(() => {
        if (sessionId !== activeSessionId) {
          return
        }

        error.value = requestError
        if (!append) {
          likeSongs.value = []
          nextOffset.value = 0
        }
      })
    } finally {
      task.commit(() => {
        if (append && sessionId === activeSessionId) {
          loadingMore.value = false
        }
      })
    }
  }

  const loadLikedSongs = async (userId: string | number): Promise<void> => {
    const task = idsRequestController.start()
    const sessionId = activeSessionId + 1
    activeSessionId = sessionId

    if (!userId) {
      task.commit(() => {
        likedSongIds.value = []
        lastRequestedUserId.value = null
        likeSongs.value = []
        nextOffset.value = 0
        loading.value = false
        loadingMore.value = false
      })
      return
    }

    loading.value = true
    loadingMore.value = false
    error.value = null
    lastRequestedUserId.value = userId

    try {
      const likeList = (await task.guard(getLikelist(Number(userId)))) as LikeListResponse

      const ids = likeList.ids ?? []

      task.commit(() => {
        likedSongIds.value = ids
        likeSongs.value = []
        nextOffset.value = 0
      })

      if (!ids.length) {
        return
      }

      await loadSongPage(0, false)
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load liked songs:', requestError)
      task.commit(() => {
        error.value = requestError
        likedSongIds.value = []
        likeSongs.value = []
        nextOffset.value = 0
      })
    } finally {
      task.commit(() => {
        loading.value = false
      })
    }
  }

  const loadMoreLikedSongs = async (): Promise<void> => {
    if (loading.value || loadingMore.value || !hasMore.value) {
      return
    }

    await loadSongPage(nextOffset.value, true)
  }

  const loadAllRemaining = async (): Promise<void> => {
    if (loading.value || !hasMore.value) return

    const sessionId = activeSessionId
    const allCollected: Song[] = [...likeSongs.value]

    while (hasMore.value && sessionId === activeSessionId) {
      const offset = nextOffset.value
      const ids = likedSongIds.value.slice(offset, offset + LIKED_SONGS_PAGE_SIZE)
      if (ids.length === 0) break

      const task = detailRequestController.start()
      loadingMore.value = true

      try {
        const detail = (await task.guard(getSongDetail(ids.join(',')))) as SongDetailResponse
        const pageSongs = buildSongsFromDetail(ids, detail)

        if (sessionId !== activeSessionId) return

        allCollected.push(...pageSongs)

        task.commit(() => {
          if (sessionId !== activeSessionId) return
          likeSongs.value = [...allCollected]
          nextOffset.value = offset + ids.length
        })
      } catch (requestError) {
        if (isCanceledRequestError(requestError)) return

        console.error('Failed to load liked songs detail:', requestError)
        task.commit(() => {
          if (sessionId !== activeSessionId) return
          error.value = requestError
          likeSongs.value = [...allCollected]
        })
        break
      } finally {
        task.commit(() => {
          if (sessionId === activeSessionId) loadingMore.value = false
        })
      }
    }
  }

  const retryLoadLikedSongs = async (): Promise<void> => {
    if (!lastRequestedUserId.value || loading.value || loadingMore.value) {
      return
    }

    await loadLikedSongs(lastRequestedUserId.value)
  }

  return {
    likeSongs,
    hasMore,
    allLoaded,
    formattedSongs,
    count,
    loading,
    loadingMore,
    error,
    resetLikedSongs,
    loadLikedSongs,
    loadMoreLikedSongs,
    loadAllRemaining,
    retryLoadLikedSongs
  }
}
