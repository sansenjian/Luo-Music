import request from '@/utils/http'

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
export function checkMusic(id: number) {
  return request({
    url: '/check/music',
    method: 'get',
    params: { 
      id, 
      randomCNIP: true, 
      timestamp: Date.now() 
    }
  })
}

/**
 * 获取音乐 URL
 * @param {number} id - 歌曲 ID
 * @param {string} level - 音质等级: standard, higher, exhigh, lossless, hires
 */
export async function getMusicUrl(id: number, level: string = 'standard'): Promise<MusicUrlResponse> {
  console.log(`[API] getMusicUrl called with id=${id}, level=${level}`)
  try {
    const res = await request({
      url: '/song/url/v1',
      method: 'get',
      params: { 
        id, 
        level, 
        randomCNIP: true, 
        unblock: 'true',
        timestamp: Date.now() 
      }
    }) as MusicUrlResponse
    
    // 检查是否有有效的 URL
    const data = res.data || (res as unknown as { data?: MusicUrlData[] }).data
    console.log('[API] v1 response:', data)
    
    if (data && data[0] && data[0].url) {
      return res
    }
    
    console.warn('[API] v1 returned no URL, throwing error to fallback')
    // 如果没有 URL，抛出错误以触发 fallback
    throw new Error('No URL returned from v1 API')
  } catch (error) {
    console.warn('Failed to get music url from v1 api, falling back to v1 legacy...', error)
    
    // 降级策略：尝试使用旧版接口
    // 映射 level 到 br (比特率)
    let br = 128000
    switch (level) {
      case 'standard': br = 128000; break
      case 'higher': br = 192000; break
      case 'exhigh': br = 320000; break
      case 'lossless': br = 999000; break
      case 'hires': br = 999000; break
      default: br = 128000
    }
    
    try {
      const fallbackRes = await request({
        url: '/song/url',
        method: 'get',
        params: { 
          id, 
          br, 
          randomCNIP: true, 
          timestamp: Date.now() 
        }
      }) as MusicUrlResponse
      console.log('[API] Legacy response:', fallbackRes.data || fallbackRes)
      return fallbackRes
    } catch (fallbackError) {
      console.error('[API] Legacy fallback failed:', fallbackError)
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
export function getLyric(id: number) {
  return request({
    url: '/lyric',
    method: 'get',
    params: { 
      id, 
      timestamp: new Date().getTime() 
    }
  })
}

/**
 * 获取歌曲详情
 * @param {string} ids - 歌曲 ID，多个用逗号分隔
 */
export function getSongDetail(ids: string) {
  return request({
    url: '/song/detail',
    method: 'get',
    params: { 
      ids, 
      timestamp: new Date().getTime() 
    }
  })
}

/**
 * 获取喜欢歌曲列表
 * @param {number} uid - 用户 ID
 */
export function getLikelist(uid: number) {
  return request({
    url: '/likelist',
    method: 'get',
    params: { uid, timestamp: new Date().getTime() }
  })
}
