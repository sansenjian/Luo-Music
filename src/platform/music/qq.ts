import {
  MusicPlatformAdapter,
  createSong,
  type Song,
  type SearchResult,
  type LyricResult,
  type PlaylistDetail,
} from './interface'
import {
  qqMusicAdapter,
  qqMusicApi,
  type QQSearchData,
  type QQSearchSongItem,
  type QQSongInfoData,
  type QQSongInfoTrack,
  type QQMusicPlayData,
  type QQLyricPayload,
} from '../../api/qqmusic'
import type { ApiResponse } from '../../api/adapter'

interface QQMusicPlayOptions {
  mediaId?: string
}

export class QQMusicAdapter extends MusicPlatformAdapter {
  constructor() {
    super('qq')
  }

  async search(keyword: string, limit: number = 20, page: number = 1): Promise<SearchResult> {
    const res = await qqMusicAdapter.fetch<QQSearchData>('/getSearchByKey', {
      key: keyword,
      limit,
      page
    })
    
    if (!res.success) {
      console.warn('QQ Music search failed:', res.error)
      return { list: [], total: 0 }
    }
    
    const songData = res.data?.song
    const list = songData?.list ?? []
    const total = songData?.totalnum ?? 0

    return {
      list: list.map((song) => this.normalizeSong(song)),
      total,
    }
  }

  async getSongUrl(id: string | number, options: QQMusicPlayOptions = {}): Promise<string | null> {
    let mediaId = options.mediaId

    if (!mediaId) {
      try {
        const infoRes = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
        if (infoRes.success) {
          mediaId = infoRes.data?.track_info?.file?.media_mid
        }
      } catch (error) {
        console.warn('Failed to fetch mediaId for QQ song', id, error)
      }
    }

    const res = await qqMusicAdapter.fetch<QQMusicPlayData>('/getMusicPlay', {
      songmid: id,
      mediaId,
      quality: 128
    })

    if (!res.success) {
      console.warn('QQ Music play URL failed:', res.error)
      return null
    }

    const playKey = String(id)
    const playUrl = res.data?.playUrl?.[playKey]
    if (playUrl?.url) {
      return playUrl.url
    }

    if (playUrl?.error) {
      console.warn('QQ Music Play URL error:', playUrl.error)
    }

    return null
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
    
    if (!res.success) {
      console.warn('QQ Music song detail failed:', res.error)
      return null
    }
    
    const trackInfo = res.data?.track_info

    if (trackInfo) {
      return this.normalizeSong(trackInfo)
    }

    return null
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res = await qqMusicAdapter.fetch<QQLyricPayload>('/getLyric', {
      songmid: id,
      isFormat: 0
    })

    if (!res.success) {
      console.warn('QQ Music lyric failed:', res.error)
      return { lrc: '', tlyric: '', romalrc: '' }
    }

    const lyricPayload = res.data
    return {
      lrc: lyricPayload?.lyric?.lyric || '',
      tlyric: lyricPayload?.trans || '',
      romalrc: '',
    }
  }

  async getPlaylistDetail(id: string | number): Promise<PlaylistDetail | null> {
    throw new Error(`Method not implemented for QQ playlist detail: ${id}`)
  }

  private normalizeSong(song: QQSearchSongItem | QQSongInfoTrack): Song {
    const searchSong = song as QQSearchSongItem
    const detailSong = song as QQSongInfoTrack
    const songmid = searchSong.songmid || detailSong.mid || ''
    const songname = searchSong.songname || detailSong.name || detailSong.title || ''
    const singers = song.singer || []
    const album = detailSong.album || {}
    const albummid = searchSong.albummid || album.mid || ''
    const albumname = searchSong.albumname || album.name || ''
    const duration = song.interval || 0
    const originalId = searchSong.songid || detailSong.id || songmid

    return createSong({
      id: songmid,
      name: songname,
      artists: singers.map((s) => ({
        id: s.mid || '',
        name: s.name || '',
      })),
      album: {
        id: albummid,
        name: albumname,
        picUrl: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '',
      },
      duration: duration * 1000,
      mvid: song.vid || '',
      platform: 'qq',
      originalId,
      extra: {
        mediaId: song.strMediaMid || song.file?.media_mid,
      },
    })
  }
}
