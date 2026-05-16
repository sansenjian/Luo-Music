import { neteaseRequest } from './shared/neteaseServiceRequest'

/**
 * 获取推荐歌单
 * @param {number} limit - 数量
 */
export function getRecommendPlaylist(limit: number = 10) {
  return neteaseRequest('/personalized', { limit })
}

/**
 * 获取歌单详情
 * @param {number} id - 歌单 ID
 */
export function getPlaylistDetail(id: number) {
  return neteaseRequest('/playlist/detail', { id })
}

/**
 * 获取歌单所有歌曲
 * @param {number} id - 歌单 ID
 * @param {number} limit - 数量
 * @param {number} offset - 偏移量
 */
export function getPlaylistTracks(id: number, limit: number = 100, offset: number = 0) {
  return neteaseRequest('/playlist/track/all', { id, limit, offset })
}

/**
 * 每日推荐歌曲
 */
export function getRecommendSongs() {
  return neteaseRequest('/recommend/songs')
}

/**
 * 获取用户歌单
 * @param {number} uid - 用户 ID
 */
export function getUserPlaylist(uid: number) {
  return neteaseRequest('/user/playlist', { uid })
}
