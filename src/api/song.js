import request from '../utils/request'

/**
 * 获取推荐新音乐
 * @param {number} limit - 数量，默认 10
 */
export function getNewestSong(limit = 10) {
  return request({
    url: '/personalized/newsong',
    method: 'get',
    params: { limit }
  })
}

/**
 * 检查音乐是否可用
 * @param {number} id - 歌曲 ID
 */
export function checkMusic(id) {
  return request({
    url: '/check/music',
    method: 'get',
    params: { id }
  })
}

/**
 * 获取音乐 URL
 * @param {number} id - 歌曲 ID
 * @param {string} level - 音质等级: standard, higher, exhigh, lossless, hires
 */
export function getMusicUrl(id, level = 'standard') {
  return request({
    url: '/song/url/v1',
    method: 'get',
    params: { id, level, randomCNIP: true }
  })
}

/**
 * 喜欢音乐
 * @param {number} id - 歌曲 ID
 * @param {boolean} like - 是否喜欢
 */
export function likeMusic(id, like = true) {
  return request({
    url: '/like',
    method: 'get',
    params: {
      id,
      like,
      timestamp: new Date().getTime()
    }
  })
}

/**
 * 获取歌词
 * @param {number} id - 歌曲 ID
 */
export function getLyric(id) {
  return request({
    url: '/lyric',
    method: 'get',
    params: { id }
  })
}

/**
 * 获取歌曲详情
 * @param {string} ids - 歌曲 ID，多个用逗号分隔
 */
export function getSongDetail(ids) {
  return request({
    url: '/song/detail',
    method: 'get',
    params: { ids }
  })
}
