export function formatSong(song, index = 0) {
  return {
    index,
    id: song.id,
    name: song.name,
    artist: song.ar?.map(a => a.name).join(' / ') || '未知歌手',
    album: song.al?.name || '',
    cover: song.al?.picUrl || '',
    duration: Math.floor((song.dt || 0) / 1000),
  }
}

export function formatSongs(songs) {
  return songs.map((song, idx) => formatSong(song, idx))
}

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
