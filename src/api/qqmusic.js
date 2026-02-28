import axios from 'axios'

const QQ_MUSIC_BASE_URL = 'http://localhost:3200'

const qqRequest = axios.create({
  baseURL: QQ_MUSIC_BASE_URL,
  timeout: 30000,
})

qqRequest.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('QQ Music API Error:', error)
    return Promise.reject(error)
  }
)

export const qqMusicApi = {
  search(keyword, limit = 20, page = 1) {
    return qqRequest.get('/getSearchByKey', {
      params: {
        key: keyword,
        limit: limit,
        page: page
      }
    })
  },

  // 搜索建议
  getSmartbox(keyword) {
    return qqRequest.get(`/getSmartbox/${encodeURIComponent(keyword)}`)
  },

  // 热搜词
  getHotkey() {
    return qqRequest.get('/getHotkey')
  },

  // 获取歌曲信息
  getSongInfo(songmid, songid) {
    return qqRequest.get(`/getSongInfo/${songmid}/${songid || ''}`)
  },

  // 批量获取歌曲信息
  batchGetSongInfo(songmids) {
    return qqRequest.post('/batchGetSongInfo', { songmids })
  },

  getMusicPlay(songmid, mediaId, quality = 128) {
    return qqRequest.get('/getMusicPlay', {
      params: {
        songmid: songmid,
        mediaId: mediaId,
        quality: quality
      }
    })
  },

  getLyric(songmid, isFormat = true) {
    return qqRequest.get('/getLyric', {
      params: {
        songmid: songmid,
        isFormat: isFormat ? 1 : 0
      }
    })
  },

  // 获取推荐
  getRecommend() {
    return qqRequest.get('/getRecommend')
  },

  // 获取排行榜
  getTopLists() {
    return qqRequest.get('/getTopLists')
  },

  // 获取排行榜详情
  getRanks(topId, limit = 100, page = 1) {
    return qqRequest.get(`/getRanks/${topId}/${limit}/${page}`)
  },

  // 获取歌单分类
  getSongListCategories() {
    return qqRequest.get('/getSongListCategories')
  },

  // 获取歌单列表
  getSongLists(page = 1, limit = 20, categoryId, sortId) {
    return qqRequest.get(`/getSongLists/${page}/${limit}/${categoryId || ''}/${sortId || ''}`)
  },

  // 获取歌单详情
  getSongListDetail(disstid) {
    return qqRequest.get(`/getSongListDetail/${disstid}`)
  },

  // 批量获取歌单
  batchGetSongLists(disstids) {
    return qqRequest.post('/batchGetSongLists', { disstids })
  },

  // 获取歌手列表
  getSingerList(area = -1, sex = -1, genre = -1, index = -1, page = 1) {
    return qqRequest.get(`/getSingerList/${area}/${sex}/${genre}/${index}/${page}`)
  },

  // 获取相似歌手
  getSimilarSinger(singermid) {
    return qqRequest.get(`/getSimilarSinger/${singermid}`)
  },

  // 获取歌手热门歌曲
  getSingerHotsong(singermid, limit = 20, page = 1) {
    return qqRequest.get(`/getSingerHotsong/${singermid}/${limit}/${page}`)
  },

  // 获取歌手专辑
  getSingerAlbum(singermid, limit = 20, page = 1) {
    return qqRequest.get(`/getSingerAlbum/${singermid}/${limit}/${page}`)
  },

  // 获取歌手MV
  getSingerMv(singermid, limit = 20, order = 'listen') {
    return qqRequest.get(`/getSingerMv/${singermid}/${limit}/${order}`)
  },

  // 获取歌手描述
  getSingerDesc(singermid) {
    return qqRequest.get(`/getSingerDesc/${singermid}`)
  },

  // 获取专辑信息
  getAlbumInfo(albummid) {
    return qqRequest.get(`/getAlbumInfo/${albummid}`)
  },

  // 获取新碟
  getNewDisks(page = 1, limit = 20) {
    return qqRequest.get(`/getNewDisks/${page}/${limit}`)
  },

  // 获取MV播放链接
  getMvPlay(vid) {
    return qqRequest.get(`/getMvPlay/${vid}`)
  },

  // 获取MV列表
  getMv(areaId, versionId, limit = 20, page = 1) {
    return qqRequest.get(`/getMv/${areaId}/${versionId}/${limit}/${page}`)
  },

  // 获取MV by tag
  getMvByTag(params) {
    return qqRequest.get('/getMvByTag', { params })
  },

  // 获取电台列表
  getRadioLists() {
    return qqRequest.get('/getRadioLists')
  },

  // 获取数字专辑
  getDigitalAlbumLists() {
    return qqRequest.get('/getDigitalAlbumLists')
  },

  // 获取评论
  getComments(id, params = {}) {
    const { rootcommentid, cid, pagesize, pagenum, cmd, reqtype, biztype } = params
    return qqRequest.get(`/getComments/${id}/${rootcommentid || ''}/${cid || ''}/${pagesize || 20}/${pagenum || 1}/${cmd || 0}/${reqtype || 0}/${biztype || 0}`)
  },

  // 获取图片URL
  getImageUrl(params) {
    return qqRequest.get('/getImageUrl', { params })
  },

  // QQ登录二维码
  getQQLoginQr() {
    return qqRequest.get('/user/getQQLoginQr')
  },

  // 检查QQ登录状态
  checkQQLoginQr(data) {
    return qqRequest.post('/user/checkQQLoginQr', data)
  },

  // 获取Cookie
  getCookie() {
    return qqRequest.get('/user/getCookie')
  },

  // 设置Cookie
  setCookie(cookie) {
    return qqRequest.get('/user/setCookie', { params: { cookie } })
  }
}

export default qqMusicApi
