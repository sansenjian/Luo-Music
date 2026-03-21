import { INVOKE_CHANNELS } from '../../shared/protocol/channels.ts'
import type { ServiceManager } from '../../ServiceManager'
import logger from '../../logger'
import { ipcService } from '../IpcService'
import { executeWithRetry, getCache, setCache } from '../utils/gatewayCache.ts'
import { getNeteaseSearchType } from '../../../src/platform/music/netease.constants.ts'
import { DEFAULT_AUDIO_BITRATE } from '../../../src/constants/audio.ts'

type MusicPlatform = 'netease' | 'qq'

type GatewayErrorDetails = {
  code?: string
  status?: number
  responseData?: unknown
  reason?: string
}

// 输入验证常量
const ALLOWED_SERVICES: readonly string[] = ['netease', 'qq'] as const

// 参数验证器
const PARAM_VALIDATORS = {
  keyword: (v: unknown): boolean => typeof v === 'string' && v.length > 0 && v.length <= 100,
  id: (v: unknown): boolean => typeof v === 'string' || typeof v === 'number',
  page: (v: unknown): boolean => typeof v === 'number' && v > 0 && v <= 100,
  limit: (v: unknown): boolean => typeof v === 'number' && v > 0 && v <= 100,
  quality: (v: unknown): boolean => typeof v === 'number' && v > 0,
  platform: (v: unknown): boolean => v === undefined || v === 'netease' || v === 'qq',
  type: (v: unknown): boolean => v === undefined || typeof v === 'string'
} as const

// 危险字符模式：控制字符、特殊字符、路径遍历
// eslint-disable-next-line no-control-regex
const DANGEROUS_PATTERNS = /[<>:"|?*\x00-\x1f]|\.\./

function resolvePlatform(platform?: string): MusicPlatform {
  return platform === 'qq' ? 'qq' : 'netease'
}

function normalizeEndpoint(endpoint: string): string {
  // 移除前导斜杠
  let normalized = endpoint.replace(/^\/+/, '')

  // 解码 URL 编码字符以检测隐藏的危险模式
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // 解码失败，保持原样
  }

  // 检测危险模式
  if (DANGEROUS_PATTERNS.test(normalized)) {
    logger.warn(`[API Gateway] Blocked potentially dangerous endpoint: ${endpoint}`)
    return ''
  }

  // 重新编码以确保安全
  return normalized.replace(/^\/+/, '')
}

/**
 * 验证服务名是否合法
 */
function validateService(service: unknown): { valid: boolean; error?: string } {
  if (typeof service !== 'string') {
    return { valid: false, error: 'Service must be a string' }
  }
  if (!ALLOWED_SERVICES.includes(service)) {
    return { valid: false, error: `Invalid service: ${service}. Allowed: ${ALLOWED_SERVICES.join(', ')}` }
  }
  return { valid: true }
}

/**
 * 验证端点是否合法
 * 主要检查危险字符，而不是严格限制端点列表
 */
function validateEndpoint(endpoint: unknown): { valid: boolean; error?: string; normalized?: string } {
  if (typeof endpoint !== 'string') {
    return { valid: false, error: 'Endpoint must be a string' }
  }

  if (endpoint.length === 0) {
    return { valid: false, error: 'Endpoint cannot be empty' }
  }

  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) {
    return { valid: false, error: 'Invalid endpoint: contains dangerous characters' }
  }

  // 长度限制
  if (normalized.length > 200) {
    return { valid: false, error: 'Endpoint too long' }
  }

  return { valid: true, normalized }
}

/**
 * 验证参数对象
 */
function validateParams(
  params: unknown,
  requiredKeys: readonly (keyof typeof PARAM_VALIDATORS)[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (params !== undefined && typeof params !== 'object') {
    return { valid: false, errors: ['Params must be an object'] }
  }

  const typedParams = params as Record<string, unknown> | undefined

  // 检查必需参数
  for (const key of requiredKeys) {
    const validator = PARAM_VALIDATORS[key]
    const value = typedParams?.[key]
    if (value === undefined) {
      errors.push(`Missing required parameter: ${key}`)
    } else if (validator && !validator(value)) {
      errors.push(`Invalid parameter: ${key}`)
    }
  }

  // 检查可选参数
  if (typedParams) {
    for (const [key, validator] of Object.entries(PARAM_VALIDATORS)) {
      const value = typedParams[key]
      if (value !== undefined && !validator(value)) {
        errors.push(`Invalid parameter: ${key}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

function mapNeteaseSearchType(type?: string): number {
  return getNeteaseSearchType(type)
}

function mapQualityToBitrate(quality?: number): number {
  if (typeof quality === 'number' && Number.isFinite(quality) && quality > 0) {
    return quality
  }

  return DEFAULT_AUDIO_BITRATE
}

async function requestServiceWithCache(
  serviceManager: ServiceManager,
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  noCache: boolean = false
): Promise<{ result: unknown; cached: boolean }> {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const context = `api:request ${service}:${normalizedEndpoint}`

  if (!noCache) {
    const cachedData = getCache(service, normalizedEndpoint, params)
    if (cachedData !== null) {
      return { result: cachedData, cached: true }
    }
  }

  const result = await executeWithRetry(
    () => serviceManager.handleRequest(service, normalizedEndpoint, params),
    context
  )

  if (!noCache) {
    setCache(service, normalizedEndpoint, params, result)
  }

  return { result, cached: false }
}

async function requestService(
  serviceManager: ServiceManager,
  service: string,
  endpoint: string,
  params: Record<string, unknown>,
  noCache: boolean = false
): Promise<unknown> {
  const { result } = await requestServiceWithCache(serviceManager, service, endpoint, params, noCache)
  return result
}

function serializeErrorDetails(error: unknown): GatewayErrorDetails | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const typedError = error as {
    code?: unknown
    reason?: unknown
    response?: {
      status?: unknown
      data?: unknown
    }
  }

  const details: GatewayErrorDetails = {}

  if (typeof typedError.code === 'string') {
    details.code = typedError.code
  }

  if (typeof typedError.reason === 'string') {
    details.reason = typedError.reason
  }

  if (typeof typedError.response?.status === 'number') {
    details.status = typedError.response.status
  }

  if (typedError.response?.data !== undefined) {
    details.responseData = typedError.response.data
  }

  return Object.keys(details).length > 0 ? details : undefined
}

function extractSongUrl(
  platform: MusicPlatform,
  id: string | number,
  response: unknown
): { url: string } {
  if (platform === 'qq') {
    if (response && typeof response === 'object') {
      const directUrl = (response as { url?: unknown }).url
      if (typeof directUrl === 'string' && directUrl.length > 0) {
        return { url: directUrl }
      }

      const playUrl = (response as { playUrl?: Record<string, unknown> }).playUrl
      if (playUrl && typeof playUrl === 'object') {
        const resolved = playUrl[String(id)] ?? playUrl[Object.keys(playUrl)[0] ?? '']
        if (typeof resolved === 'string' && resolved.length > 0) {
          return { url: resolved }
        }
        if (resolved && typeof resolved === 'object') {
          const nestedUrl = (resolved as { url?: unknown }).url
          if (typeof nestedUrl === 'string' && nestedUrl.length > 0) {
            return { url: nestedUrl }
          }
        }
      }
    }

    return { url: '' }
  }

  const data = response && typeof response === 'object' ? (response as { data?: unknown }).data : []
  const items = Array.isArray(data) ? data : []
  const url = items[0] && typeof items[0] === 'object' ? (items[0] as { url?: unknown }).url : ''
  return { url: typeof url === 'string' ? url : '' }
}

function normalizeLyricResponse(platform: MusicPlatform, response: unknown) {
  if (!response || typeof response !== 'object') {
    return { lyric: '', translated: '', romalrc: '' }
  }

  if (platform === 'qq') {
    const qqResponse = response as {
      lyric?: unknown
      tlyric?: unknown
      trans?: unknown
      romalrc?: unknown
    }

    const normalizeQQLyricText = (value: unknown): string => {
      if (typeof value === 'string') {
        return value
      }

      if (value && typeof value === 'object') {
        const lyric = (value as { lyric?: unknown }).lyric
        if (typeof lyric === 'string') {
          return lyric
        }
      }

      return ''
    }

    return {
      lyric: normalizeQQLyricText(qqResponse.lyric),
      translated: normalizeQQLyricText(qqResponse.tlyric ?? qqResponse.trans),
      romalrc: normalizeQQLyricText(qqResponse.romalrc)
    }
  }

  const neteaseResponse = response as {
    lyric?: unknown
    lrc?: { lyric?: unknown }
    tlyric?: string | { lyric?: unknown }
    romalrc?: string | { lyric?: unknown }
  }

  const translated =
    typeof neteaseResponse.tlyric === 'string'
      ? neteaseResponse.tlyric
      : typeof neteaseResponse.tlyric?.lyric === 'string'
        ? neteaseResponse.tlyric.lyric
        : ''

  const romalrc =
    typeof neteaseResponse.romalrc === 'string'
      ? neteaseResponse.romalrc
      : typeof neteaseResponse.romalrc?.lyric === 'string'
        ? neteaseResponse.romalrc.lyric
        : ''

  return {
    lyric:
      typeof neteaseResponse.lyric === 'string'
        ? neteaseResponse.lyric
        : typeof neteaseResponse.lrc?.lyric === 'string'
          ? neteaseResponse.lrc.lyric
          : '',
    translated,
    romalrc
  }
}

function getSearchTarget(platform: MusicPlatform, keyword: string, type?: string, page = 1, limit = 30) {
  if (platform === 'qq') {
    return {
      endpoint: 'getSearchByKey',
      params: {
        key: keyword,
        type,
        page,
        limit
      }
    }
  }

  return {
    endpoint: 'cloudsearch',
    params: {
      keywords: keyword,
      type: mapNeteaseSearchType(type),
      limit,
      offset: Math.max(page - 1, 0) * limit
    }
  }
}

export function registerApiHandlers(serviceManager: ServiceManager): void {
  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_REQUEST,
    async ({
      service,
      endpoint,
      params,
      noCache
    }: {
      service: string
      endpoint: string
      params: Record<string, unknown>
      noCache?: boolean
    }) => {
      // 验证服务
      const serviceValidation = validateService(service)
      if (!serviceValidation.valid) {
        logger.warn(`[API Gateway] Service validation failed: ${serviceValidation.error}`)
        return { success: false, error: serviceValidation.error }
      }

      // 验证端点
      const endpointValidation = validateEndpoint(endpoint)
      if (!endpointValidation.valid) {
        logger.warn(`[API Gateway] Endpoint validation failed: ${endpointValidation.error}`)
        return { success: false, error: endpointValidation.error }
      }

      try {
        const { result, cached } = await requestServiceWithCache(
          serviceManager,
          service,
          endpointValidation.normalized!,
          params,
          noCache
        )
        return { success: true, data: result, cached }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const errorDetails = serializeErrorDetails(error)
        logger.error(
          `[API Gateway] api:request ${service}:${endpointValidation.normalized} failed after retries:`,
          errorMessage
        )
        return {
          success: false,
          error: errorMessage,
          errorDetails
        }
      }
    }
  )

  ipcService.registerInvoke(INVOKE_CHANNELS.API_GET_SERVICES, async () => {
    const services = serviceManager.getAvailableServices()
    return Promise.resolve(Object.keys(services).filter(key => services[key] !== null))
  })

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_SEARCH,
    async ({
      keyword,
      type,
      platform,
      page = 1,
      limit = 30
    }: {
      keyword: string
      type?: string
      platform?: MusicPlatform
      page?: number
      limit?: number
    }) => {
      // 参数验证
      const paramsValidation = validateParams({ keyword, type, platform, page, limit }, ['keyword'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] Search params validation failed: ${paramsValidation.errors.join(', ')}`)
        return { success: false, error: paramsValidation.errors[0] }
      }

      const targetPlatform = resolvePlatform(platform)
      const target = getSearchTarget(targetPlatform, keyword, type, page, limit)
      return requestService(serviceManager, targetPlatform, target.endpoint, target.params)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_SONG_URL,
    async ({
      id,
      platform,
      quality,
      mediaId
    }: {
      id: string | number
      platform?: MusicPlatform
      quality?: number
      mediaId?: string
    }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform, quality }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetSongUrl params validation failed: ${paramsValidation.errors.join(', ')}`)
        return { url: '' }
      }

      const targetPlatform = resolvePlatform(platform)
      if (targetPlatform === 'qq') {
        const response = await requestService(serviceManager, 'qq', 'getMusicPlay', {
          songmid: id,
          mediaId,
          quality,
          resType: 'play'
        })

        return extractSongUrl(targetPlatform, id, response)
      }

      const v1Response = await requestService(serviceManager, 'netease', 'song/url/v1', {
        id,
        level: 'standard'
      })
      const v1Url = extractSongUrl(targetPlatform, id, v1Response)
      if (v1Url.url) {
        return v1Url
      }

      const legacyResponse = await requestService(serviceManager, 'netease', 'song/url', {
        id,
        br: mapQualityToBitrate(quality)
      })

      return extractSongUrl(targetPlatform, id, legacyResponse)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_LYRIC,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetLyric params validation failed: ${paramsValidation.errors.join(', ')}`)
        return { lyric: '', translated: '', romalrc: '' }
      }

      const targetPlatform = resolvePlatform(platform)
      const response =
        targetPlatform === 'qq'
          ? await requestService(serviceManager, 'qq', 'getLyric', { songmid: id })
          : await requestService(serviceManager, 'netease', 'lyric', { id })

      return normalizeLyricResponse(targetPlatform, response)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_SONG_DETAIL,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetSongDetail params validation failed: ${paramsValidation.errors.join(', ')}`)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', `getSongInfo/${id}`, {})
        : requestService(serviceManager, 'netease', 'song/detail', { ids: String(id) })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_PLAYLIST_DETAIL,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetPlaylistDetail params validation failed: ${paramsValidation.errors.join(', ')}`)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', `getSongListDetail/${id}`, {})
        : requestService(serviceManager, 'netease', 'playlist/detail', { id })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_ARTIST_DETAIL,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetArtistDetail params validation failed: ${paramsValidation.errors.join(', ')}`)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', `getSingerDesc/${id}`, {})
        : requestService(serviceManager, 'netease', 'artist/detail', { id })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_ALBUM_DETAIL,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      // 参数验证
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetAlbumDetail params validation failed: ${paramsValidation.errors.join(', ')}`)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', `getAlbumInfo/${id}`, {})
        : requestService(serviceManager, 'netease', 'album', { id })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_RECOMMENDED_PLAYLISTS,
    async ({ platform, limit = 30 }: { platform?: MusicPlatform; limit?: number }) => {
      // 参数验证
      const paramsValidation = validateParams({ platform, limit }, [])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetRecommendedPlaylists params validation failed: ${paramsValidation.errors.join(', ')}`)
        return []
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', 'getRecommend', {})
        : requestService(serviceManager, 'netease', 'personalized', { limit })
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_CHART,
    async ({ platform, id }: { platform?: MusicPlatform; id?: string }) => {
      // 参数验证
      const paramsValidation = validateParams({ platform, id }, [])
      if (!paramsValidation.valid) {
        logger.warn(`[API Gateway] GetChart params validation failed: ${paramsValidation.errors.join(', ')}`)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(
            serviceManager,
            'qq',
            id ? `getRanks/${id}/100/1` : 'getTopLists',
            {}
          )
        : requestService(
            serviceManager,
            'netease',
            id ? 'top/list' : 'toplist/detail',
            id ? { id } : {}
          )
    }
  )
}
