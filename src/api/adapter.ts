import {
  parseQQMusicResponse,
  parseNeteaseResponse,
  handleApiError,
  type ApiResponse
} from './responseHandler'

/**
 * API 请求参数接口
 */
export interface ApiRequestParams {
  [key: string]: string | number | boolean | undefined
}

/**
 * HTTP 请求实例接口，定义 get 和 post 方法
 */
export interface HttpRequestInstance {
  get<T>(endpoint: string, config?: { params?: ApiRequestParams }): Promise<T>
  post<T>(endpoint: string, data?: unknown): Promise<T>
}

export abstract class ApiAdapter {
  abstract fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>>
}

export class QQMusicAdapter extends ApiAdapter {
  private request: HttpRequestInstance

  constructor(request: HttpRequestInstance) {
    super()
    this.request = request
  }

  async fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.get(endpoint, { params })
      return parseQQMusicResponse<T>(res)
    } catch (error) {
      throw handleApiError(error, 'QQ 音乐')
    }
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.post(endpoint, data)
      return parseQQMusicResponse<T>(res)
    } catch (error) {
      throw handleApiError(error, 'QQ 音乐')
    }
  }
}

export class NeteaseAdapter extends ApiAdapter {
  private request: HttpRequestInstance

  constructor(request: HttpRequestInstance) {
    super()
    this.request = request
  }

  async fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.get(endpoint, { params })
      return parseNeteaseResponse<T>(res)
    } catch (error) {
      throw handleApiError(error, '网易云音乐')
    }
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.post(endpoint, data)
      return parseNeteaseResponse<T>(res)
    } catch (error) {
      throw handleApiError(error, '网易云音乐')
    }
  }
}

// ApiRequestParams 在本地定义，供外部使用
export { ApiRequestParams }
