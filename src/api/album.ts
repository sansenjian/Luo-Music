import type { AxiosResponse } from 'axios'

import { neteaseRequest } from './shared/neteaseServiceRequest'

export interface AlbumArtistResponse {
  id?: string | number
  name?: string
}

export interface AlbumInfoResponse {
  id?: string | number
  name?: string
  picUrl?: string
  size?: number
  artist?: AlbumArtistResponse
  artists?: AlbumArtistResponse[]
}

export interface AlbumTrackResponse {
  id?: string | number
  name?: string
  platform?: 'netease' | 'qq'
  server?: 'netease' | 'qq'
  artists?: AlbumArtistResponse[]
  ar?: AlbumArtistResponse[]
  album?: {
    id?: string | number
    name?: string
    picUrl?: string
    artist?: {
      img1v1Url?: string
    }
  }
  al?: {
    id?: string | number
    name?: string
    picUrl?: string
    artist?: {
      img1v1Url?: string
    }
  }
  duration?: number
  dt?: number
  mvid?: string | number
  mv?: string | number
  originalId?: string | number
  url?: string
  mediaId?: string | number
  extra?: Record<string, unknown>
}

export interface AlbumDetailResponse {
  album?: AlbumInfoResponse
  songs?: AlbumTrackResponse[]
}

export interface AlbumSublistResponse {
  count?: number
  data?: AlbumInfoResponse[]
  hasMore?: boolean
}

type HttpResponseData<T> = AxiosResponse<T> | T

function isAxiosResponseLike<T>(response: HttpResponseData<T>): response is AxiosResponse<T> {
  return Boolean(
    response &&
    typeof response === 'object' &&
    'data' in response &&
    'status' in response &&
    typeof response.status === 'number' &&
    'headers' in response &&
    response.headers &&
    typeof response.headers === 'object' &&
    'config' in response &&
    response.config &&
    typeof response.config === 'object'
  )
}

function unwrapResponseData<T>(response: HttpResponseData<T>): T {
  if (isAxiosResponseLike(response)) {
    return response.data
  }

  return response as T
}

/**
 * 获取专辑详情
 * @param {number} id - 专辑 ID
 */
export async function getAlbumDetail(id: number): Promise<AlbumDetailResponse> {
  const response = await neteaseRequest('/album', { id })

  return unwrapResponseData(response as HttpResponseData<AlbumDetailResponse>)
}

/**
 * 获取当前登录用户收藏的专辑
 * @param {number} limit - 数量
 * @param {number} offset - 偏移量
 */
export async function getAlbumSublist(
  limit: number = 50,
  offset: number = 0
): Promise<AlbumSublistResponse> {
  const response = await neteaseRequest('/album/sublist', { limit, offset })

  return unwrapResponseData(response as HttpResponseData<AlbumSublistResponse>)
}
