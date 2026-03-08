import type { AxiosResponse } from 'axios'

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  code?: number
}

export abstract class ApiAdapter {
  abstract fetch<T>(endpoint: string, params?: any): Promise<ApiResponse<T>>

  protected normalize<T>(response: any, code?: number): ApiResponse<T> {
    return {
      success: code === 200 || code === 0 || response.code === 200 || response.code === 0,
      data: response.data as T ?? response.result ?? response,
      error: response.message ?? response.error,
      code: code ?? response.code
    }
  }

  protected handleError(error: any): ApiResponse<never> {
    console.error('API Error:', error.message ?? error)
    return {
      success: false,
      data: null as never,
      error: error.message ?? 'Unknown error',
      code: error.code ?? error.status ?? -1
    }
  }
}

export class QQMusicAdapter extends ApiAdapter {
  private request: any

  constructor(request: any) {
    super()
    this.request = request
  }

  async fetch<T>(endpoint: string, params?: any): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.get(endpoint, { params })
      const parsed = this.parseWrappedResponse(res)
      return this.normalize<T>(parsed, parsed.code ?? parsed.result)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.post(endpoint, data)
      const parsed = this.parseWrappedResponse(res)
      return this.normalize<T>(parsed, parsed.code ?? parsed.result)
    } catch (error) {
      return this.handleError(error)
    }
  }

  private parseWrappedResponse<T>(payload: any): any {
    if (typeof payload.response === 'string') {
      try {
        return JSON.parse(payload.response)
      } catch (error) {
        console.error('Failed to parse QQ wrapped response', error)
      }
    }
    return payload
  }
}

export class NeteaseAdapter extends ApiAdapter {
  private request: any

  constructor(request: any) {
    super()
    this.request = request
  }

  async fetch<T>(endpoint: string, params?: any): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.get(endpoint, { params })
      return this.normalize<T>(res.data ?? res, res.code)
    } catch (error) {
      return this.handleError(error)
    }
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const res = await this.request.post(endpoint, data)
      return this.normalize<T>(res.data ?? res, res.code)
    } catch (error) {
      return this.handleError(error)
    }
  }
}
