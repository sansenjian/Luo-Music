/**
 * Netease Music - 数据标准化
 *
 * 将网易云音乐 API 的原始响应转换为 Luo-Music 统一数据模型。
 */

export function normalizeNeteaseImageUrl(value) {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const absoluteUrl = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed

  try {
    const url = new URL(absoluteUrl)
    if (url.protocol === 'http:' && url.hostname.endsWith('.music.126.net')) {
      url.protocol = 'https:'
      return url.href
    }
  } catch {
    return trimmed
  }

  return absoluteUrl
}

export function normalizeSong(song, platformId) {
  const picUrl = song.al?.picUrl || song.album?.picUrl || song.album?.artist?.img1v1Url || ''

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
      picUrl: normalizeNeteaseImageUrl(picUrl)
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
    coverImgUrl: normalizeNeteaseImageUrl(playlist.coverImgUrl),
    description: playlist.description,
    trackCount: playlist.trackCount,
    tracks: (playlist.tracks || []).map(track => normalizeSong(track, platformId))
  }
}

export function normalizePlaylistSummary(playlist) {
  return {
    id: playlist.id,
    name: playlist.name || '',
    coverImgUrl: normalizeNeteaseImageUrl(playlist.coverImgUrl),
    description: playlist.description,
    trackCount: playlist.trackCount,
    subscribed: Boolean(playlist.subscribed),
    creator:
      playlist.creator && playlist.creator.userId
        ? {
            id: playlist.creator.userId,
            nickname: String(playlist.creator.nickname || ''),
            avatarUrl: normalizeNeteaseImageUrl(playlist.creator.avatarUrl),
            homepageUrl: `https://music.163.com/#/user/home?id=${playlist.creator.userId}`
          }
        : undefined
  }
}
