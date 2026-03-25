import {
  handleApiError,
  parseNeteaseResponse,
  parseQQMusicResponse,
  type ApiResponse
} from './responseHandler'

export interface ApiRequestParams {
  [key: string]: string | number | boolean | undefined
}

export interface HttpRequestInstance {
  get<T>(endpoint: string, config?: { params?: ApiRequestParams }): Promise<T>
  post<T>(endpoint: string, data?: unknown): Promise<T>
}

export abstract class ApiAdapter {
  abstract fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>>
}

export class QQMusicAdapter extends ApiAdapter {
  constructor(private readonly request: HttpRequestInstance) {
    super()
  }

  async fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>> {
    try {
      const response = await this.request.get(endpoint, { params })
      return parseQQMusicResponse<T>(response)
    } catch (error) {
      throw handleApiError(error, 'QQ Music')
    }
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await this.request.post(endpoint, data)
      return parseQQMusicResponse<T>(response)
    } catch (error) {
      throw handleApiError(error, 'QQ Music')
    }
  }
}

export class NeteaseAdapter extends ApiAdapter {
  constructor(private readonly request: HttpRequestInstance) {
    super()
  }

  async fetch<T>(endpoint: string, params?: ApiRequestParams): Promise<ApiResponse<T>> {
    try {
      const response = await this.request.get(endpoint, { params })
      return parseNeteaseResponse<T>(response)
    } catch (error) {
      throw handleApiError(error, 'Netease Music')
    }
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await this.request.post(endpoint, data)
      return parseNeteaseResponse<T>(response)
    } catch (error) {
      throw handleApiError(error, 'Netease Music')
    }
  }
}
