import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getPlaylistDetail, getPlaylistTracks, getUserPlaylist } from '../api/playlist'
import { createSong, type Song } from '../platform/music/interface'
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

const PLAYLIST_TRACK_PAGE_SIZE = 100

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
    platform: track.platform ?? track.server ?? 'netease',
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

  if (Array.isArray((payload as { songs?: unknown }).songs)) {
    return (payload as { songs: RawPlaylistTrack[] }).songs
  }

  if (Array.isArray((payload as { playlist?: { tracks?: unknown } }).playlist?.tracks)) {
    return (payload as { playlist: { tracks: RawPlaylistTrack[] } }).playlist.tracks
  }

  return []
}

async function loadAllPlaylistTracks(playlistId: number): Promise<Song[]> {
  const tracks: Song[] = []
  let offset = 0

  while (true) {
    const response = await getPlaylistTracks(playlistId, PLAYLIST_TRACK_PAGE_SIZE, offset)
    const rawTracks = extractPlaylistTracks(response)
    if (!rawTracks.length) {
      break
    }

    tracks.push(
      ...rawTracks
        .map(track => normalizePlaylistTrack(track))
        .filter((track): track is Song => Boolean(track))
    )

    if (rawTracks.length < PLAYLIST_TRACK_PAGE_SIZE) {
      break
    }

    offset += rawTracks.length
  }

  return tracks
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
      const playlistIdNumber = Number(playlistId)
      const fullTracks = await loadAllPlaylistTracks(playlistIdNumber)
      if (fullTracks.length > 0) {
        return fullTracks
      }

      const response = (await getPlaylistDetail(playlistIdNumber)) as {
        playlist?: {
          tracks?: RawPlaylistTrack[]
        }
      }

      return extractPlaylistTracks(response)
        .map(track => normalizePlaylistTrack(track))
        .filter((track): track is Song => Boolean(track))
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
