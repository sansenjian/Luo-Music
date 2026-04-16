import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type {
  AlbumDetailResponse,
  AlbumInfoResponse as RawAlbumInfo,
  AlbumSublistResponse,
  AlbumTrackResponse as RawAlbumTrack
} from '@/api/album'
import { getAlbumDetail, getAlbumSublist } from '@/api/album'
import { createSong, type Song } from '@/platform/music/interface'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import { createLatestRequestController } from '@/utils/http/requestScope'

export interface FavoriteAlbumItem {
  id: string | number
  name: string
  picUrl: string
  size: number
  artistName: string
  [key: string]: unknown
}

export interface UseFavoriteAlbumsReturn {
  albums: Ref<FavoriteAlbumItem[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  error: Ref<unknown>
  resetFavoriteAlbums: () => void
  loadFavoriteAlbums: (userId: string | number) => Promise<void>
  loadAlbumSongs: (albumId: string | number) => Promise<Song[]>
}

const ALBUM_PAGE_SIZE = 50

function formatAlbumArtistName(album: RawAlbumInfo): string {
  if (Array.isArray(album.artists) && album.artists.length > 0) {
    return album.artists
      .map(artist => artist.name?.trim() ?? '')
      .filter(Boolean)
      .join(' / ')
  }

  return album.artist?.name?.trim() ?? ''
}

function normalizeFavoriteAlbum(album: RawAlbumInfo): FavoriteAlbumItem | null {
  if (album.id === undefined || !album.name) {
    return null
  }

  return {
    ...album,
    id: album.id,
    name: album.name,
    picUrl: album.picUrl ?? '',
    size: Number(album.size) > 0 ? Number(album.size) : 0,
    artistName: formatAlbumArtistName(album)
  }
}

function normalizeAlbumTrack(
  track: RawAlbumTrack,
  fallbackAlbum?: RawAlbumInfo | null
): Song | null {
  if (track.id === undefined || !track.name) {
    return null
  }

  const artistsSource = Array.isArray(track.artists)
    ? track.artists
    : Array.isArray(track.ar)
      ? track.ar
      : []
  const albumSource = track.album ?? track.al

  return createSong({
    id: track.id,
    name: track.name,
    artists: artistsSource.map(artist => ({
      id: artist.id ?? 0,
      name: artist.name ?? ''
    })),
    album: {
      id: albumSource?.id ?? fallbackAlbum?.id ?? 0,
      name: albumSource?.name ?? fallbackAlbum?.name ?? '',
      picUrl: albumSource?.picUrl ?? albumSource?.artist?.img1v1Url ?? fallbackAlbum?.picUrl ?? ''
    },
    duration: track.duration ?? track.dt ?? 0,
    mvid: track.mvid ?? track.mv ?? 0,
    platform: track.platform ?? track.server ?? 'netease',
    originalId: track.originalId ?? track.id,
    ...(track.url ? { url: track.url } : {}),
    ...(track.mediaId !== undefined ? { mediaId: track.mediaId } : {}),
    ...(track.extra ? { extra: track.extra } : {})
  })
}

function extractFavoriteAlbums(payload: unknown): RawAlbumInfo[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  return Array.isArray((payload as AlbumSublistResponse).data)
    ? ((payload as AlbumSublistResponse).data ?? [])
    : []
}

function extractAlbumSongs(payload: unknown): RawAlbumTrack[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  return Array.isArray((payload as { songs?: RawAlbumTrack[] }).songs)
    ? ((payload as { songs?: RawAlbumTrack[] }).songs ?? [])
    : []
}

function extractAlbumInfo(payload: unknown): RawAlbumInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const album = (payload as AlbumDetailResponse).album
  if (!album || typeof album !== 'object') {
    return null
  }

  return album
}

export function useFavoriteAlbums(): UseFavoriteAlbumsReturn {
  const albums = ref<FavoriteAlbumItem[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const count = computed(() => albums.value.length)
  const requestController = createLatestRequestController()
  const albumSongsRequestController = createLatestRequestController()

  const resetFavoriteAlbums = (): void => {
    requestController.cancel()
    albumSongsRequestController.cancel()
    albums.value = []
    loading.value = false
    error.value = null
  }

  const loadFavoriteAlbums = async (userId: string | number): Promise<void> => {
    const task = requestController.start()

    if (!userId) {
      task.commit(() => {
        albums.value = []
        loading.value = false
      })
      return
    }

    loading.value = true
    error.value = null

    try {
      const nextAlbums: FavoriteAlbumItem[] = []
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const response = (await task.guard(
          getAlbumSublist(ALBUM_PAGE_SIZE, offset)
        )) as AlbumSublistResponse
        const rawPageAlbums = extractFavoriteAlbums(response)
        const rawPageCount = rawPageAlbums.length
        const pageAlbums = rawPageAlbums
          .map(album => normalizeFavoriteAlbum(album))
          .filter((album): album is FavoriteAlbumItem => Boolean(album))

        nextAlbums.push(...pageAlbums)

        const totalCount = Number(response.count)
        const reachedEnd =
          rawPageCount === 0 || (Number.isFinite(totalCount) && nextAlbums.length >= totalCount)

        const canInferMore =
          rawPageCount === ALBUM_PAGE_SIZE &&
          (!Number.isFinite(totalCount) || nextAlbums.length < totalCount)

        hasMore = (response.hasMore ?? canInferMore) && !reachedEnd
        if (!hasMore) {
          break
        }

        offset += rawPageCount
      }

      task.commit(() => {
        albums.value = nextAlbums
      })
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        return
      }

      console.error('Failed to load favorite albums:', requestError)
      task.commit(() => {
        error.value = requestError
      })
    } finally {
      task.commit(() => {
        loading.value = false
      })
    }
  }

  const loadAlbumSongs = async (albumId: string | number): Promise<Song[]> => {
    const task = albumSongsRequestController.start()

    try {
      const response = (await task.guard(getAlbumDetail(Number(albumId)))) as AlbumDetailResponse
      const fallbackAlbum = extractAlbumInfo(response)
      const songs = extractAlbumSongs(response)
        .map(track => normalizeAlbumTrack(track, fallbackAlbum))
        .filter((track): track is Song => Boolean(track))

      task.throwIfCanceled()
      return songs
    } catch (requestError) {
      if (isCanceledRequestError(requestError)) {
        throw requestError
      }

      console.error('Failed to load album detail:', requestError)
      throw requestError
    }
  }

  return {
    albums,
    count,
    loading,
    error,
    resetFavoriteAlbums,
    loadFavoriteAlbums,
    loadAlbumSongs
  }
}

export default useFavoriteAlbums
