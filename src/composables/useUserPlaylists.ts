import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'

import { getPlaylistDetail, getPlaylistTracks, getUserPlaylist } from '@/api/playlist'
import { createSong, type Song } from '@/platform/music/interface'
import { isCanceledRequestError } from '@/utils/http/cancelError'
import { createLatestRequestController } from '@/utils/http/requestScope'

export interface PlaylistItem {
  id: string | number
  name: string
  trackCount?: number
  subscribed?: boolean
  [key: string]: unknown
}

interface PlaylistTrackArtist {
  id?: string | number
  name?: string
}

interface PlaylistTrackAlbum {
  id?: string | number
  name?: string
  picUrl?: string
  artist?: {
    img1v1Url?: string
  }
}

interface RawPlaylistTrack {
  id?: string | number
  name?: string
  platform?: Song['platform']
  server?: Song['platform']
  artists?: PlaylistTrackArtist[]
  ar?: PlaylistTrackArtist[]
  album?: PlaylistTrackAlbum
  al?: PlaylistTrackAlbum
  duration?: number
  dt?: number
  mvid?: string | number
  mv?: string | number
  originalId?: string | number
  url?: string
  mediaId?: string | number
  extra?: Record<string, unknown>
}

export interface PlaylistTracksState {
  songs: Ref<Song[]>
  hasMore: ComputedRef<boolean>
  loading: Ref<boolean>
  loadingMore: Ref<boolean>
  error: Ref<unknown>
  loadFirstPage: (playlistId: string | number) => Promise<Song[]>
  loadMore: () => Promise<void>
  reset: () => void
}

export interface UseUserPlaylistsReturn {
  playlists: Ref<PlaylistItem[]>
  createdPlaylists: ComputedRef<PlaylistItem[]>
  favoritePlaylists: ComputedRef<PlaylistItem[]>
  count: ComputedRef<number>
  loading: Ref<boolean>
  error: Ref<unknown>
  resetPlaylists: () => void
  loadPlaylists: (userId: string | number) => Promise<void>
  loadInitialPlaylistSongs: (playlistId: string | number) => Promise<Song[]>
  loadPlaylistSongs: (playlistId: string | number) => Promise<Song[]>
  usePlaylistTracks: () => PlaylistTracksState
}

const PLAYLIST_TRACK_INITIAL_PAGE_SIZE = 50
const PLAYLIST_TRACK_PAGE_SIZE = 100
const PLAYLIST_TRACK_PAGE_LIMIT = 100

function normalizePlaylistTrack(track: RawPlaylistTrack): Song | null {
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
      id: albumSource?.id ?? 0,
      name: albumSource?.name ?? '',
      picUrl: albumSource?.picUrl ?? albumSource?.artist?.img1v1Url ?? ''
    },
    duration: track.duration ?? track.dt ?? 0,
    mvid: track.mvid ?? track.mv ?? 0,
    platform: track.platform === 'qq' || track.server === 'qq' ? 'qq' : 'netease',
    originalId: track.originalId ?? track.id,
    ...(track.url ? { url: track.url } : {}),
    ...(track.mediaId !== undefined ? { mediaId: track.mediaId } : {}),
    ...(track.extra ? { extra: track.extra } : {})
  })
}

function extractPlaylistTracks(payload: unknown): RawPlaylistTrack[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const obj = payload as Record<string, unknown>

  if (Array.isArray(obj.songs)) {
    return obj.songs as RawPlaylistTrack[]
  }

  // Nested: { data: { songs: [...] } }
  if (
    obj.data &&
    typeof obj.data === 'object' &&
    Array.isArray((obj.data as Record<string, unknown>).songs)
  ) {
    return (obj.data as Record<string, unknown>).songs as RawPlaylistTrack[]
  }

  if (obj.playlist && typeof obj.playlist === 'object') {
    const pl = obj.playlist as Record<string, unknown>
    if (Array.isArray(pl.tracks)) {
      return pl.tracks as RawPlaylistTrack[]
    }
  }

  return []
}

function parseTracksFromResponse(response: unknown): Song[] {
  return extractPlaylistTracks(response)
    .map(track => normalizePlaylistTrack(track))
    .filter((track): track is Song => Boolean(track))
}

async function fetchTrackPage(playlistId: number, offset: number): Promise<Song[]> {
  const response = await getPlaylistTracks(playlistId, PLAYLIST_TRACK_PAGE_SIZE, offset)
  return parseTracksFromResponse(response)
}

async function fetchInitialTrackPage(playlistId: number): Promise<Song[]> {
  const response = await getPlaylistTracks(playlistId, PLAYLIST_TRACK_INITIAL_PAGE_SIZE, 0)
  return parseTracksFromResponse(response)
}

async function loadAllPlaylistTracks(playlistId: number): Promise<Song[]> {
  const songs: Song[] = []
  let offset = 0

  for (let page = 0; page < PLAYLIST_TRACK_PAGE_LIMIT; page += 1) {
    const pageSongs = await fetchTrackPage(playlistId, offset)

    if (pageSongs.length === 0) {
      break
    }

    songs.push(...pageSongs)
    offset += pageSongs.length

    if (pageSongs.length < PLAYLIST_TRACK_PAGE_SIZE) {
      break
    }
  }

  return songs
}

export function useUserPlaylists(): UseUserPlaylistsReturn {
  const playlists = ref<PlaylistItem[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  const createdPlaylists = computed(() =>
    playlists.value.filter(playlist => playlist.subscribed !== true)
  )
  const favoritePlaylists = computed(() =>
    playlists.value.filter(playlist => playlist.subscribed === true)
  )
  const count = computed(() => createdPlaylists.value.length)
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

  const loadInitialPlaylistSongs = async (playlistId: string | number): Promise<Song[]> => {
    const playlistIdNumber = Number(playlistId)
    let songs = await fetchInitialTrackPage(playlistIdNumber)

    if (songs.length === 0) {
      const response = (await getPlaylistDetail(playlistIdNumber)) as {
        playlist?: { tracks?: RawPlaylistTrack[] }
      }
      songs = parseTracksFromResponse(response)
    }

    return songs
  }

  // Legacy: load all tracks at once (used by home collection panel)
  const loadPlaylistSongs = async (playlistId: string | number): Promise<Song[]> => {
    const playlistIdNumber = Number(playlistId)
    const songs = await loadAllPlaylistTracks(playlistIdNumber)
    if (songs.length > 0) return songs

    const response = (await getPlaylistDetail(playlistIdNumber)) as {
      playlist?: { tracks?: RawPlaylistTrack[] }
    }
    return parseTracksFromResponse(response)
  }

  // Paginated track loading
  const usePlaylistTracks = (): PlaylistTracksState => {
    const songs = shallowRef<Song[]>([])
    const loading = ref(false)
    const loadingMore = ref(false)
    const errorState = ref<unknown>(null)
    const hasMoreState = ref(false)
    let currentPlaylistId: number | null = null
    let nextOffset = 0
    let activeSessionId = 0

    const hasMore = computed(() => hasMoreState.value)

    const reset = (): void => {
      activeSessionId += 1
      currentPlaylistId = null
      songs.value = []
      nextOffset = 0
      hasMoreState.value = false
      loading.value = false
      loadingMore.value = false
      errorState.value = null
    }

    const loadFirstPage = async (playlistId: string | number): Promise<Song[]> => {
      const sessionId = ++activeSessionId
      const playlistIdNumber = Number(playlistId)
      currentPlaylistId = playlistIdNumber
      loading.value = true
      loadingMore.value = false
      errorState.value = null

      try {
        let pageSongs = await fetchInitialTrackPage(playlistIdNumber)

        if (sessionId !== activeSessionId) return pageSongs

        if (pageSongs.length === 0) {
          const response = (await getPlaylistDetail(playlistIdNumber)) as {
            playlist?: { tracks?: RawPlaylistTrack[] }
          }
          pageSongs = parseTracksFromResponse(response)
        }

        if (sessionId !== activeSessionId) return pageSongs

        songs.value = pageSongs
        nextOffset = pageSongs.length
        hasMoreState.value = pageSongs.length >= PLAYLIST_TRACK_INITIAL_PAGE_SIZE
        return pageSongs
      } catch (err) {
        if (sessionId !== activeSessionId) return []
        errorState.value = err
        throw err
      } finally {
        if (sessionId === activeSessionId) loading.value = false
      }
    }

    const loadMore = async (): Promise<void> => {
      if (!currentPlaylistId || loading.value || loadingMore.value) return

      const sessionId = activeSessionId
      loadingMore.value = true

      try {
        const pageSongs = await fetchTrackPage(currentPlaylistId, nextOffset)
        if (sessionId !== activeSessionId) return

        if (pageSongs.length > 0) {
          songs.value = [...songs.value, ...pageSongs]
          nextOffset += pageSongs.length
          hasMoreState.value = pageSongs.length >= PLAYLIST_TRACK_PAGE_SIZE
        } else {
          hasMoreState.value = false
        }
      } catch (err) {
        if (sessionId !== activeSessionId) return
        console.error('Failed to load more playlist tracks:', err)
      } finally {
        if (sessionId === activeSessionId) loadingMore.value = false
      }
    }

    return {
      songs,
      hasMore,
      loading,
      loadingMore,
      error: errorState,
      loadFirstPage,
      loadMore,
      reset
    }
  }

  return {
    playlists,
    createdPlaylists,
    favoritePlaylists,
    count,
    loading,
    error,
    resetPlaylists,
    loadPlaylists,
    loadInitialPlaylistSongs,
    loadPlaylistSongs,
    usePlaylistTracks
  }
}
