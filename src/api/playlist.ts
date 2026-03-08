import request from '@/utils/http'

/**
 * 获取推荐歌单
 * @param {number} limit - 数量
 */
export function getRecommendPlaylist(limit: number = 10) {
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
export function getPlaylistDetail(id: number) {
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
export function getPlaylistTracks(id: number, limit: number = 100, offset: number = 0) {
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

/**
 * 获取用户歌单
 * @param {number} uid - 用户 ID
 */
export function getUserPlaylist(uid: number) {
  return request({
    url: '/user/playlist',
    method: 'get',
    params: { uid }
  })
}
