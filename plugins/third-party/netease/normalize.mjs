/**
 * Netease Music - 数据标准化
 *
 * 将网易云音乐 API 的原始响应转换为 Luo-Music 统一数据模型。
 */

export function normalizeSong(song, platformId) {
  return {
    id: song.id || 0,
    name: song.name || '',
    artists: (song.ar || song.artists || []).map(artist => ({
      id: artist.id || 0,
      name: artist.name || ''
    })),
    album: {
      id: song.al?.id || song.album?.id || 0,
      name: song.al?.name || song.album?.name || '',
      picUrl: song.al?.picUrl || song.album?.picUrl || song.album?.artist?.img1v1Url || ''
    },
    duration: song.dt || song.duration || 0,
    mvid: song.mv || song.mvid || 0,
    platform: platformId,
    originalId: song.id || 0
  }
}

export function normalizePlaylist(playlist, platformId) {
  return {
    id: playlist.id,
    name: playlist.name,
    coverImgUrl: playlist.coverImgUrl || '',
    description: playlist.description,
    trackCount: playlist.trackCount,
    tracks: (playlist.tracks || []).map(track => normalizeSong(track, platformId))
  }
}
