import {
  MusicPlatformAdapter,
  createSong,
  type LyricResult,
  type PlaylistDetail,
  type SearchResult,
  type Song
} from './interface'
import { buildQQMusicCoverUrl } from './qq.const'
import {
  qqMusicAdapter,
  type QQMusicPlayData,
  type QQLyricPayload,
  type QQSearchData,
  type QQSearchSongItem,
  type QQSongInfoData,
  type QQSongInfoTrack
} from '@/api/qqmusic'
import { validateSearchResponse } from '@/api/responseHandler'

interface QQMusicPlayOptions {
  mediaId?: string
}

type QQSinger = {
  mid?: string | number
  name?: string
}

type QQSong = QQSearchSongItem | QQSongInfoTrack

function resolvePlayableUrl(
  playData: QQMusicPlayData | null | undefined,
  songId: string | number
): string | null {
  if (!playData) {
    return null
  }

  if (typeof playData.url === 'string' && playData.url.length > 0) {
    return playData.url
  }

  if (!playData.playUrl) {
    return null
  }

  const playKey = String(songId)
  const value = playData.playUrl[playKey] ?? playData.playUrl[Object.keys(playData.playUrl)[0]]
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    return value || null
  }

  if (typeof value.url === 'string' && value.url.length > 0) {
    return value.url
  }

  return null
}

function normalizeLyricText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const lyric = (value as { lyric?: unknown }).lyric
    if (typeof lyric === 'string') {
      return lyric
    }
  }

  return ''
}

export class QQMusicAdapter extends MusicPlatformAdapter {
  constructor() {
    super('qq')
  }

  async search(keyword: string, limit = 20, page = 1): Promise<SearchResult> {
    const response = await qqMusicAdapter.fetch<QQSearchData>('/getSearchByKey', {
      key: keyword,
      limit,
      page
    })

    if (!response.success) {
      throw new Error(`QQ 音乐搜索失败: ${response.error || response.code || 'unknown error'}`)
    }

    const validation = validateSearchResponse(response.data)
    if (!validation.valid) {
      return { list: [], total: 0 }
    }

    return {
      list: validation.list.map(song => this.normalizeSong(song as QQSong)),
      total: validation.total
    }
  }

  async getSongUrl(id: string | number, options: QQMusicPlayOptions = {}): Promise<string | null> {
    let mediaId = options.mediaId

    if (!mediaId) {
      try {
        const songInfo = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
        if (songInfo.success) {
          const trackInfo = songInfo.data?.track_info
          mediaId = trackInfo?.strMediaMid || trackInfo?.file?.media_mid || trackInfo?.mid
        }
      } catch {
        console.warn('[QQMusic] getSongUrl: failed to fetch song info', { id })
      }
    }

    const requestParams: Record<string, string | number | boolean | undefined> = {
      songmid: id,
      mediaId,
      resType: 'play'
    }

    const response = await qqMusicAdapter.fetch<QQMusicPlayData>('/getMusicPlay', requestParams)
    if (!response.data) {
      console.warn('[QQMusic] getSongUrl failed', {
        id,
        mediaId,
        code: response.code,
        error: response.error
      })
      return null
    }

    const url = resolvePlayableUrl(response.data, id)
    if (!url) {
      console.warn('[QQMusic] getSongUrl empty playUrl', { id, mediaId })
    }
    return url
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const response = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
    return response.success && response.data?.track_info
      ? this.normalizeSong(response.data.track_info)
      : null
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const response = await qqMusicAdapter.fetch<QQLyricPayload>('/getLyric', {
      songmid: id
    })

    if (!response.data) {
      return { lrc: '', tlyric: '', romalrc: '' }
    }

    const lrc = normalizeLyricText(response.data.lyric)
    const tlyric = normalizeLyricText(response.data.tlyric ?? response.data.trans)
    const romalrc = normalizeLyricText(response.data.romalrc)

    return {
      lrc,
      tlyric,
      romalrc
    }
  }

  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    throw new Error(`Method not implemented for QQ playlist detail: ${id}`)
  }

  private normalizeSong(song: QQSong): Song {
    const detailSong = song as QQSongInfoTrack
    const searchSong = song as QQSearchSongItem
    const singers = (song.singer || []) as QQSinger[]
    const album = detailSong.album || {}
    const albumMid = String(searchSong.albummid || album.mid || '')
    const songMid = searchSong.songmid || detailSong.mid || ''
    const originalId = searchSong.songid || detailSong.id || songMid

    return createSong({
      id: songMid,
      name: searchSong.songname || detailSong.name || detailSong.title || '',
      artists: singers.map(singer => ({
        id: singer.mid || '',
        name: singer.name || ''
      })),
      album: {
        id: albumMid,
        name: searchSong.albumname || album.name || '',
        picUrl: buildQQMusicCoverUrl(albumMid)
      },
      duration: (song.interval || 0) * 1000,
      mvid: song.vid || '',
      platform: 'qq',
      originalId,
      extra: {
        mediaId: song.strMediaMid || song.file?.media_mid
      }
    })
  }
}
