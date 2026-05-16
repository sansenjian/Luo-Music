import { getBitrateByLevel, DEFAULT_AUDIO_BITRATE } from '@/constants/audio'
import { neteaseRequest, withTimestamp } from './shared/neteaseServiceRequest'

/** 音乐 URL 响应数据 */
interface MusicUrlData {
  id: number
  url: string
  br?: number
  size?: number
  type?: string
  level?: string
}

/** 音乐 URL API 响应 */
interface MusicUrlResponse {
  code: number
  data: MusicUrlData[]
}

/**
 * 获取推荐新音乐
 * @param {number} limit - 数量，默认 10
 */
export function getNewestSong(limit: number = 10) {
  return neteaseRequest('/personalized/newsong', { limit })
}

/**
 * 检查音乐是否可用
 * @param {number} id - 歌曲 ID
 */
export function checkMusic(id: number) {
  return neteaseRequest('/check/music', withTimestamp({ id, randomCNIP: true }))
}

/**
 * 获取音乐 URL
 * @param {number} id - 歌曲 ID
 * @param {string} level - 音质等级: standard, higher, exhigh, lossless, hires
 */
export async function getMusicUrl(
  id: number,
  level: string = 'standard'
): Promise<MusicUrlResponse> {
  try {
    const res = (await neteaseRequest(
      '/song/url/v1',
      withTimestamp({
        id,
        level,
        randomCNIP: true,
        unblock: 'true'
      })
    )) as MusicUrlResponse

    // 检查是否有有效的 URL
    const data = res.data

    if (data && data[0] && data[0].url) {
      return res
    }

    // 如果没有 URL，抛出错误以触发 fallback
    throw new Error('No URL returned from v1 API')
  } catch {
    // 降级策略：尝试使用旧版接口
    const br = getBitrateByLevel(level, DEFAULT_AUDIO_BITRATE)

    try {
      const fallbackRes = (await neteaseRequest(
        '/song/url',
        withTimestamp({
          id,
          br,
          randomCNIP: true
        })
      )) as MusicUrlResponse
      return fallbackRes
    } catch (fallbackError) {
      console.error('[API] Failed to get music URL:', fallbackError)
      throw fallbackError
    }
  }
}

/**
 * 喜欢音乐
 * @param {number} id - 歌曲 ID
 * @param {boolean} like - 是否喜欢
 */
export function likeMusic(id: number, like: boolean = true) {
  return neteaseRequest('/like', withTimestamp({ id, like }))
}

/**
 * 获取歌词
 * @param {number} id - 歌曲 ID
 */
export function getLyric(id: number) {
  return neteaseRequest('/lyric', withTimestamp({ id }))
}

/**
 * 获取歌曲详情
 * @param {string} ids - 歌曲 ID，多个用逗号分隔
 */
export function getSongDetail(ids: string) {
  return neteaseRequest('/song/detail', withTimestamp({ ids }))
}

/**
 * 获取喜欢歌曲列表
 * @param {number} uid - 用户 ID
 */
export function getLikelist(uid: number) {
  return neteaseRequest('/likelist', withTimestamp({ uid }))
}
