/**
 * QQ 音乐平台常量配置
 */

/**
 * QQ 音乐专辑封面 CDN 基础 URL
 * @param albumMid - 专辑媒体 ID
 * @returns 完整的封面图片 URL
 */
export const QQ_MUSIC_COVER_BASE_URL = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000'

/**
 * 构建 QQ 音乐专辑封面 URL
 * @param albumMid - 专辑媒体 ID
 * @returns 封面图片 URL，如果 albumMid 为空则返回空字符串
 */
export function buildQQMusicCoverUrl(albumMid: string | undefined | null): string {
  if (!albumMid) {
    return ''
  }
  return `${QQ_MUSIC_COVER_BASE_URL}${albumMid}.jpg`
}

/**
 * QQ 音乐 API 错误码映射
 */
export const QQ_MUSIC_ERROR_MAP: Record<number, string> = {
  0: '成功',
  1: '系统错误',
  2: '参数错误',
  3: '权限不足',
  4: '资源不存在',
  5: '版权限制',
  6: 'VIP 限制',
  7: '地区限制',
  8: '请求过于频繁'
} as const

/**
 * 根据错误码获取错误信息
 * @param code - QQ 音乐 API 返回的错误码
 * @returns 错误描述信息
 */
export function getQQMusicErrorMessage(code: number): string {
  return QQ_MUSIC_ERROR_MAP[code] || `未知错误 (code: ${code})`
}
