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
  type QQSearchData,
  type QQSearchSongItem,
  type QQSongInfoData,
  type QQSongInfoTrack,
  type QQMusicPlayData,
  type QQLyricPayload,
} from '../../api/qqmusic'
import { validateSearchResponse } from '../../api/responseHandler'
import { Errors } from '../../utils/error'
import { buildQQMusicCoverUrl } from './qq.const'

// 开发模式下的调试日志
const debugLog = import.meta.env.DEV ? console.log.bind(console, '[QQMusicAdapter]') : () => {}
const debugWarn = import.meta.env.DEV ? console.warn.bind(console, '[QQMusicAdapter]') : () => {}

interface QQMusicPlayOptions {
  mediaId?: string
}

export class QQMusicAdapter extends MusicPlatformAdapter {
  constructor() {
    super('qq')
  }

  async search(keyword: string, limit: number = 20, page: number = 1): Promise<SearchResult> {
    debugLog('Searching:', { keyword, limit, page })
    
    const res = await qqMusicAdapter.fetch<QQSearchData>('/getSearchByKey', {
      key: keyword,
      limit,
      page
    })
    
    debugLog('Response:', res)
    
    // 使用统一的响应验证
    if (!res.success) {
      const errorMsg = res.error || `请求失败 (code: ${res.code})`
      debugWarn('Search failed:', errorMsg)
      throw new Error(`QQ 音乐搜索失败: ${errorMsg}`)
    }
    
    // 验证和提取搜索数据
    const validation = validateSearchResponse(res.data)
    
    if (!validation.valid) {
      debugWarn('Invalid data format:', validation.error)
      return { list: [], total: 0 }
    }
    
    debugLog('Parsed results:', { 
      count: validation.list.length, 
      total: validation.total 
    })

    return {
      list: validation.list.map((song) => this.normalizeSong(song)),
      total: validation.total,
    }
  }

  async getSongUrl(id: string | number, options: QQMusicPlayOptions = {}): Promise<string | null> {
    debugLog('getSongUrl called with id:', id, 'options:', options)
    let mediaId = options.mediaId

    // 如果没有提供 mediaId，尝试从歌曲信息中获取
    if (!mediaId) {
      try {
        debugLog('Fetching song info for mediaId:', id)
        const infoRes = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
        debugLog('Song info response:', infoRes)
        
        if (infoRes.success && infoRes.data) {
          // 尝试多种可能的 mediaId 路径
          const trackInfo = infoRes.data.track_info
          mediaId = trackInfo?.strMediaMid ||
                    trackInfo?.file?.media_mid ||
                    trackInfo?.mid
          debugLog('Extracted mediaId:', mediaId)
        } else {
          debugWarn('Song info request failed or no data:', infoRes)
        }
      } catch (error) {
        debugWarn('Failed to fetch mediaId for QQ song', id, error)
      }
    }

    // 构建请求参数 - 根据官方文档，只需要 songmid 参数
    const requestParams: Record<string, unknown> = {
      songmid: id
    }
    
    // 只有在获取到 mediaId 时才添加到请求参数
    if (mediaId) {
      requestParams.mediaId = mediaId
    }

    debugLog('Fetching play URL with params:', requestParams)
    const res = await qqMusicAdapter.fetch<QQMusicPlayData>('/getMusicPlay', requestParams)
    debugLog('Play URL response:', JSON.stringify(res, null, 2))
    debugLog('Play URL response - success:', res.success, 'code:', res.code, 'error:', res.error)
    debugLog('Play URL response - data keys:', res.data ? Object.keys(res.data) : 'no data')

    if (!res.success) {
      debugWarn('Play URL failed - success is false')
      debugWarn('Response error:', res.error)
      debugWarn('Response code:', res.code)
      debugWarn('Raw response:', JSON.stringify(res.raw))
      return null
    }

    // 适配新的响应格式：{ data: { url: "http://...", size: 123, quality: "128kbps" } }
    // 首先尝试直接获取 data.url
    if (res.data?.url) {
      debugLog('Got play URL from data.url:', res.data.url.substring(0, 50) + '...')
      return res.data.url
    }
    
    // 兼容旧格式：{ data: { playUrl: { [songmid]: { url: "..." } } } }
    if (res.data?.playUrl) {
      debugLog('Found playUrl object, keys:', Object.keys(res.data.playUrl))
      const playKey = String(id)
      const playUrl = res.data.playUrl[playKey] || res.data.playUrl[Object.keys(res.data.playUrl)[0]]
      debugLog('Selected playUrl entry:', playUrl)
      
      if (playUrl?.url) {
        debugLog('Got play URL from playUrl:', playUrl.url.substring(0, 50) + '...')
        return playUrl.url
      }

      if (playUrl?.error) {
        debugWarn('Play URL error:', playUrl.error)
      }
    }

    debugWarn('No play URL found in response')
    debugWarn('Full data object:', JSON.stringify(res.data, null, 2))
    return null
  }

  async getSongDetail(id: string | number): Promise<Song | null> {
    const res = await qqMusicAdapter.fetch<QQSongInfoData>(`/getSongInfo/${id}`)
    
    if (!res.success) {
      debugWarn('QQ Music song detail failed:', res.error)
      return null
    }
    
    const trackInfo = res.data?.track_info
    return trackInfo ? this.normalizeSong(trackInfo) : null
  }

  async getLyric(id: string | number): Promise<LyricResult> {
    const res = await qqMusicAdapter.fetch<QQLyricPayload>('/getLyric', {
      songmid: id,
      isFormat: 0
    })

    if (!res.success) {
      debugWarn('QQ Music lyric failed:', res.error)
      return { lrc: '', tlyric: '', romalrc: '' }
    }

    return {
      lrc: res.data?.lyric?.lyric || '',
      tlyric: res.data?.trans || '',
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
        picUrl: buildQQMusicCoverUrl(albummid),
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
