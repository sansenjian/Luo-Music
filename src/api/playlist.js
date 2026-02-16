import request from '../utils/request'

/**
 * 获取推荐歌单
 * @param {number} limit - 数量
 */
export function getRecommendPlaylist(limit = 10) {
  return request({
    url: '/personalized',
    method: 'get',
    params: { limit }
  })
}

/**
 * 获取歌单详情
 * @param {number} id - 歌单 ID
 */
export function getPlaylistDetail(id) {
  return request({
    url: '/playlist/detail',
    method: 'get',
    params: { id }
  })
}

/**
 * 获取歌单所有歌曲
 * @param {number} id - 歌单 ID
 * @param {number} limit - 数量
 * @param {number} offset - 偏移量
 */
export function getPlaylistTracks(id, limit = 100, offset = 0) {
  return request({
    url: '/playlist/track/all',
    method: 'get',
    params: { id, limit, offset }
  })
}

/**
 * 每日推荐歌曲
 */
export function getRecommendSongs() {
  return request({
    url: '/recommend/songs',
    method: 'get'
  })
}
