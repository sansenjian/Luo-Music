import { INVOKE_CHANNELS } from '../../shared/protocol/channels.ts'
import type { ServiceManager } from '../../ServiceManager'
import logger from '../../logger'
import { ipcService } from '../IpcService'
import type { MusicPlatform } from './api.contract'
import { requestService, requestServiceWithCache, serializeErrorDetails } from './api.gateway'
import {
  extractSongUrl,
  getSearchTarget,
  normalizeLyricResponse,
  resolveSongUrlFallbackBitrate
} from './api.normalizers'
import {
  resolvePlatform,
  validateEndpoint,
  validateParams,
  validateService
} from './api.validation'

function logValidationFailure(scope: string, errors: string[]): void {
  logger.warn(`[API Gateway] ${scope} params validation failed: ${errors.join(', ')}`)
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
      const serviceValidation = validateService(service)
      if (!serviceValidation.valid) {
        logger.warn(`[API Gateway] Service validation failed: ${serviceValidation.error}`)
        return { success: false, error: serviceValidation.error }
      }

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
      const paramsValidation = validateParams({ keyword, type, platform, page, limit }, ['keyword'])
      if (!paramsValidation.valid) {
        logValidationFailure('Search', paramsValidation.errors)
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
      const paramsValidation = validateParams({ id, platform, quality }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetSongUrl', paramsValidation.errors)
        return { url: '' }
      }

      const targetPlatform = resolvePlatform(platform)

      // 验证平台是否受支持
      if (targetPlatform !== 'qq' && targetPlatform !== 'netease') {
        logger.error(`[API] Unsupported platform: ${targetPlatform}`)
        return { url: '', error: `Unsupported platform: ${targetPlatform}` }
      }

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
        br: resolveSongUrlFallbackBitrate(quality)
      })

      return extractSongUrl(targetPlatform, id, legacyResponse)
    }
  )

  ipcService.registerInvoke(
    INVOKE_CHANNELS.API_GET_LYRIC,
    async ({ id, platform }: { id: string | number; platform?: MusicPlatform }) => {
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetLyric', paramsValidation.errors)
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
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetSongDetail', paramsValidation.errors)
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
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetPlaylistDetail', paramsValidation.errors)
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
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetArtistDetail', paramsValidation.errors)
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
      const paramsValidation = validateParams({ id, platform }, ['id'])
      if (!paramsValidation.valid) {
        logValidationFailure('GetAlbumDetail', paramsValidation.errors)
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
      const paramsValidation = validateParams({ platform, limit }, [])
      if (!paramsValidation.valid) {
        logValidationFailure('GetRecommendedPlaylists', paramsValidation.errors)
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
      const paramsValidation = validateParams({ platform, id }, [])
      if (!paramsValidation.valid) {
        logValidationFailure('GetChart', paramsValidation.errors)
        return null
      }

      const targetPlatform = resolvePlatform(platform)
      return targetPlatform === 'qq'
        ? requestService(serviceManager, 'qq', id ? `getRanks/${id}/100/1` : 'getTopLists', {})
        : requestService(
            serviceManager,
            'netease',
            id ? 'top/list' : 'toplist/detail',
            id ? { id } : {}
          )
    }
  )
}
