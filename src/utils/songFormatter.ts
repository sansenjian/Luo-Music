interface SongArtist {
  name?: string
}

interface SongAlbum {
  name?: string
  picUrl?: string
}

interface RawSong {
  id: string | number
  name: string
  ar?: SongArtist[]
  al?: SongAlbum
  dt?: number
}

export interface FormattedSong {
  index: number
  id: string | number
  name: string
  artist: string
  album: string
  cover: string
  duration: number
}

export function formatSong(song: RawSong, index = 0): FormattedSong {
  return {
    index,
    id: song.id,
    name: song.name,
    artist:
      song.ar
        ?.map(artist => artist.name)
        .filter(Boolean)
        .join(' / ') || '未知歌手',
    album: song.al?.name || '',
    cover: song.al?.picUrl || '',
    duration: Math.floor((song.dt || 0) / 1000)
  }
}

export function formatSongs(songs: RawSong[]): FormattedSong[] {
  return songs.map((song, idx) => formatSong(song, idx))
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
