import request from '../utils/request'

/**
 * 搜索
 * @param {string} keywords - 搜索关键词
 * @param {number} type - 搜索类型: 1-单曲, 10-专辑, 100-歌手, 1000-歌单, 1002-用户, 1004-MV, 1006-歌词, 1009-电台, 1014-视频
 * @param {number} limit - 返回数量
 * @param {number} offset - 偏移量
 */
export function search(keywords, type = 1, limit = 30, offset = 0) {
  return request({
    url: '/cloudsearch',
    method: 'get',
    params: {
      keywords,
      type,
      limit,
      offset
    }
  })
}

/**
 * 搜索建议
 * @param {string} keywords - 搜索关键词
 */
export function searchSuggest(keywords) {
  return request({
    url: '/search/suggest',
    method: 'get',
    params: { keywords }
  })
}

/**
 * 热搜列表
 */
export function getHotSearch() {
  return request({
    url: '/search/hot/detail',
    method: 'get'
  })
}
