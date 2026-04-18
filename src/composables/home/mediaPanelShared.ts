import type { Song } from '@/platform/music/interface'

export type HomeMediaSongItem = {
  id: string | number
  name: string
  artist: string
  album: string
  cover: string
  durationMs: number
}

export type HomeMediaPlayerStore = {
  setSongList: (songs: Song[]) => void
  playSongWithDetails: (index: number) => Promise<void>
}

export type HomeMediaToastStore = {
  error: (message: string) => void
}

type SearchableMediaSong = Pick<HomeMediaSongItem, 'name' | 'artist' | 'album'>
type HomeMediaSongSource = Song & {
  al?: {
    name?: string
    picUrl?: string
  }
  ar?: Array<{
    name?: string
  }>
  dt?: number
}

export function buildPlaybackSelection<T extends { id: string | number }>(
  filteredSongs: T[],
  sourceSongs: Song[],
  selectedIndex: number
): { playbackIndex: number; songs: Song[] } | null {
  const targetSong = filteredSongs[selectedIndex]
  if (!targetSong) {
    return null
  }

  const playbackSongs = filteredSongs
    .map(song => sourceSongs.find(candidate => candidate.id === song.id))
    .filter((song): song is Song => Boolean(song))
  const playbackIndex = playbackSongs.findIndex(song => song.id === targetSong.id)

  if (playbackIndex === -1) {
    return null
  }

  return {
    playbackIndex,
    songs: playbackSongs
  }
}

export function createHomeMediaSong(
  song: HomeMediaSongSource,
  fallbackCover = ''
): HomeMediaSongItem {
  const artistItems =
    Array.isArray(song.artists) && song.artists.length > 0
      ? song.artists
      : Array.isArray(song.ar)
        ? song.ar
        : []
  const albumName = song.album?.name || song.al?.name || '单曲'
  const cover = song.album?.picUrl || song.al?.picUrl || fallbackCover
  const durationMs =
    typeof song.duration === 'number' ? song.duration : typeof song.dt === 'number' ? song.dt : 0

  return {
    id: song.id,
    name: song.name,
    artist:
      artistItems
        .map(artist => artist.name)
        .filter(Boolean)
        .join(' / ') || '未知歌手',
    album: albumName,
    cover,
    durationMs
  }
}

export function filterMediaSongsByQuery<T extends SearchableMediaSong>(
  songs: T[],
  searchQuery: string
): T[] {
  const normalizedQuery = normalizeMediaSearchQuery(searchQuery)
  if (!normalizedQuery) {
    return songs
  }

  return songs.filter(song => {
    const fields = [song.name, song.artist, song.album]
    return fields.some(field => field.toLocaleLowerCase().includes(normalizedQuery))
  })
}

export function normalizeMediaSearchQuery(searchQuery: string): string {
  return searchQuery.trim().toLocaleLowerCase()
}

export async function playMediaSongSelection(
  playerStore: HomeMediaPlayerStore,
  toastStore: HomeMediaToastStore,
  songs: Song[],
  playbackIndex: number,
  fallbackMessage: string
): Promise<void> {
  if (songs.length === 0 || playbackIndex < 0) {
    return
  }

  try {
    playerStore.setSongList(songs)
    await playerStore.playSongWithDetails(playbackIndex)
  } catch (error) {
    toastStore.error(resolvePanelErrorMessage(error, fallbackMessage))
  }
}

export function resolvePanelErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallbackMessage
}
