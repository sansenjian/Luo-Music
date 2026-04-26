/**
 * QQ Music - 数据标准化
 *
 * 将 QQ 音乐 API 的原始响应转换为 Luo-Music 统一数据模型。
 */

const QQ_MUSIC_COVER_BASE_URL = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000'

export function buildCoverUrl(albumMid) {
  if (!albumMid) return ''
  return `${QQ_MUSIC_COVER_BASE_URL}${albumMid}.jpg`
}

export function normalizeSong(song, platformId) {
  const singers = (song.singer || [])
  const album = song.album || {}
  const albumMid = String(song.albummid || album.mid || '')
  const songMid = song.songmid || song.mid || ''
  const originalId = song.songid || song.id || songMid

  return {
    id: songMid,
    name: song.songname || song.name || song.title || '',
    artists: singers.map(singer => ({
      id: singer.mid || '',
      name: singer.name || ''
    })),
    album: {
      id: albumMid,
      name: song.albumname || album.name || '',
      picUrl: buildCoverUrl(albumMid)
    },
    duration: (song.interval || 0) * 1000,
    mvid: song.vid || '',
    platform: platformId,
    originalId,
    extra: {
      mediaId: song.strMediaMid || song.file?.media_mid
    }
  }
}
