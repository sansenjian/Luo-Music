import request from '@/utils/http'

/**
 * 获取专辑详情
 * @param {number} id - 专辑 ID
 */
export function getAlbumDetail(id: number) {
  return request({
    url: '/album',
    method: 'get',
    params: { id }
  })
}

/**
 * 获取当前登录用户收藏的专辑
 * @param {number} limit - 数量
 * @param {number} offset - 偏移量
 */
export function getAlbumSublist(limit: number = 50, offset: number = 0) {
  return request({
    url: '/album/sublist',
    method: 'get',
    params: { limit, offset }
  })
}
