import axios from 'axios'
import { QQMusicAdapter } from './adapter'

const QQ_MUSIC_BASE_URL = 'http://localhost:3200'

export interface QQApiWrappedResponse<T> {
  response?: string | T
  data?: T
  code?: number
  result?: number
}

export interface QQSearchSongItem {
  songmid?: string
  songid?: string | number
  songname?: string
  singer?: Array<{ mid?: string | number; name?: string }>
  albummid?: string
  albumname?: string
  interval?: number
  vid?: string | number
  strMediaMid?: string
  file?: {
    media_mid?: string
  }
}

export interface QQSearchData {
  song?: {
    list?: QQSearchSongItem[]
    totalnum?: number
  }
}

export interface QQSongInfoTrack {
  mid?: string
  id?: string | number
  name?: string
  title?: string
  singer?: Array<{ mid?: string | number; name?: string }>
  album?: {
    mid?: string | number
    name?: string
  }
  albummid?: string | number
  albumname?: string
  interval?: number
  vid?: string | number
  songid?: string | number
  strMediaMid?: string
  file?: {
    media_mid?: string
  }
}

export interface QQSongInfoData {
  track_info?: QQSongInfoTrack
}

export interface QQMusicPlayEntry {
  url?: string
  error?: string
}

export interface QQMusicPlayData {
  playUrl?: Record<string, QQMusicPlayEntry>
}

export interface QQLyricPayload {
  lyric?: {
    lyric?: string
  }
  trans?: string
}

export type QQSearchResponse = QQApiWrappedResponse<QQSearchData>
export type QQSongInfoResponse = QQApiWrappedResponse<QQSongInfoData>
export type QQMusicPlayResponse = QQApiWrappedResponse<QQMusicPlayData>
export type QQLyricResponse = QQApiWrappedResponse<QQLyricPayload>

const qqRequest = axios.create({
  baseURL: QQ_MUSIC_BASE_URL,
  timeout: 30000,
})

qqRequest.interceptors.response.use(
  (response) => {
    if (response && response.data) {
      return response.data
    }
    return response
  },
  (error) => {
    console.error('QQ Music API Error:', error.message)
    if (error.code === 'ERR_NETWORK' || !error.response) {
      console.warn('QQ Music API 网络错误，请检查 API 服务是否正常运行')
    }
    return Promise.reject(error)
  }
)

export const qqMusicAdapter = new QQMusicAdapter(qqRequest)

export const qqMusicApi = {
  search(keyword: string, limit: number = 20, page: number = 1) {
    return qqRequest.get<any, Promise<QQSearchResponse>>('/getSearchByKey', {
      params: {
        key: keyword,
        limit,
        page
      }
    })
  },

  getSmartbox(keyword: string) {
    return qqRequest.get(`/getSmartbox/${encodeURIComponent(keyword)}`)
  },

  getHotkey() {
    return qqRequest.get('/getHotkey')
  },

  getSongInfo(songmid: string | number, songid?: string | number) {
    return qqRequest.get<any, Promise<QQSongInfoResponse>>(`/getSongInfo/${songmid}/${songid || ''}`)
  },

  batchGetSongInfo(songmids: string[]) {
    return qqRequest.post('/batchGetSongInfo', { songmids })
  },

  getMusicPlay(songmid: string | number, mediaId?: string, quality: number = 128) {
    return qqRequest.get<any, Promise<QQMusicPlayResponse>>('/getMusicPlay', {
      params: {
        songmid,
        mediaId,
        quality
      }
    })
  },

  getLyric(songmid: string | number, isFormat: boolean = true) {
    return qqRequest.get<any, Promise<QQLyricResponse>>('/getLyric', {
      params: {
        songmid,
        isFormat: isFormat ? 1 : 0
      }
    })
  },

  getRecommend() {
    return qqRequest.get('/getRecommend')
  },

  getTopLists() {
    return qqRequest.get('/getTopLists')
  },

  getRanks(topId: string | number, limit: number = 100, page: number = 1) {
    return qqRequest.get(`/getRanks/${topId}/${limit}/${page}`)
  },

  getSongListCategories() {
    return qqRequest.get('/getSongListCategories')
  },

  getSongLists(page: number = 1, limit: number = 20, categoryId?: string | number, sortId?: string | number) {
    return qqRequest.get(`/getSongLists/${page}/${limit}/${categoryId || ''}/${sortId || ''}`)
  },

  getSongListDetail(disstid: string) {
    return qqRequest.get(`/getSongListDetail/${disstid}`)
  },

  batchGetSongLists(disstids: string[]) {
    return qqRequest.post('/batchGetSongLists', { disstids })
  },

  getSingerList(area: number = -1, sex: number = -1, genre: number = -1, index: number = -1, page: number = 1) {
    return qqRequest.get(`/getSingerList/${area}/${sex}/${genre}/${index}/${page}`)
  },

  getSimilarSinger(singermid: string) {
    return qqRequest.get(`/getSimilarSinger/${singermid}`)
  },

  getSingerHotsong(singermid: string, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getSingerHotsong/${singermid}/${limit}/${page}`)
  },

  getSingerAlbum(singermid: string, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getSingerAlbum/${singermid}/${limit}/${page}`)
  },

  getSingerMv(singermid: string, limit: number = 20, order: string = 'listen') {
    return qqRequest.get(`/getSingerMv/${singermid}/${limit}/${order}`)
  },

  getSingerDesc(singermid: string) {
    return qqRequest.get(`/getSingerDesc/${singermid}`)
  },

  getAlbumInfo(albummid: string) {
    return qqRequest.get(`/getAlbumInfo/${albummid}`)
  },

  getNewDisks(page: number = 1, limit: number = 20) {
    return qqRequest.get(`/getNewDisks/${page}/${limit}`)
  },

  getMvPlay(vid: string) {
    return qqRequest.get(`/getMvPlay/${vid}`)
  },

  getMv(areaId: number, versionId: number, limit: number = 20, page: number = 1) {
    return qqRequest.get(`/getMv/${areaId}/${versionId}/${limit}/${page}`)
  },

  getMvByTag(params: Record<string, unknown>) {
    return qqRequest.get('/getMvByTag', { params })
  },

  getRadioLists() {
    return qqRequest.get('/getRadioLists')
  },

  getDigitalAlbumLists() {
    return qqRequest.get('/getDigitalAlbumLists')
  },

  getComments(id: string, params: Record<string, unknown> = {}) {
    const { rootcommentid, cid, pagesize, pagenum, cmd, reqtype, biztype } = params as {
      rootcommentid?: string | number
      cid?: string | number
      pagesize?: string | number
      pagenum?: string | number
      cmd?: string | number
      reqtype?: string | number
      biztype?: string | number
    }

    return qqRequest.get(`/getComments/${id}/${rootcommentid || ''}/${cid || ''}/${pagesize || 20}/${pagenum || 1}/${cmd || 0}/${reqtype || 0}/${biztype || 0}`)
  },

  getImageUrl(params: Record<string, unknown>) {
    return qqRequest.get('/getImageUrl', { params })
  },

  getQQLoginQr() {
    return qqRequest.get('/user/getQQLoginQr')
  },

  checkQQLoginQr(ptqrtoken: string, qrsig: string) {
    return qqRequest.post('/user/checkQQLoginQr', null, {
      params: {
        ptqrtoken,
        qrsig
      }
    })
  },

  checkQQMusicLogin() {
    return qqRequest.get('/user/getCookie')
  }
}

export default qqMusicApi
