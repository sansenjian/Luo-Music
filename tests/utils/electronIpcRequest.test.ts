import { afterEach, describe, expect, it, vi } from 'vitest'
import axios, { type InternalAxiosRequestConfig } from 'axios'

import {
  createElectronIpcAdapter,
  hasElectronIpcRequestSupport
} from '../../src/utils/http/electronIpcRequest'

function setElectronApi(apiRequest?: (service: string, endpoint: string, params: Record<string, unknown>) => Promise<unknown>) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: apiRequest ? { apiRequest } : undefined
  })
}

describe('electronIpcRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setElectronApi()
  })

  it('routes Electron renderer requests through the generic IPC gateway', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ code: 200, songs: [] })
    setElectronApi(apiRequest)

    const adapter = createElectronIpcAdapter('netease')
    expect(adapter).toBeTypeOf('function')
    expect(hasElectronIpcRequestSupport()).toBe(true)

    const response = await adapter!({
      url: '/cloudsearch',
      method: 'get',
      params: { keywords: 'jay', limit: 30 }
    } as InternalAxiosRequestConfig)

    expect(apiRequest).toHaveBeenCalledWith('netease', 'cloudsearch', {
      keywords: 'jay',
      limit: 30
    })
    expect(response.data).toEqual({ code: 200, songs: [] })
    expect(response.status).toBe(200)
  })

  it('merges post body and params before invoking the IPC gateway', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ ok: true })
    setElectronApi(apiRequest)

    const adapter = createElectronIpcAdapter('qq')
    await adapter!({
      url: '/user/checkQQLoginQr',
      method: 'post',
      data: JSON.stringify({ qrsig: 'abc' }),
      params: { ptqrtoken: 'token' }
    } as InternalAxiosRequestConfig)

    expect(apiRequest).toHaveBeenCalledWith('qq', 'user/checkQQLoginQr', {
      qrsig: 'abc',
      ptqrtoken: 'token'
    })
  })

  it('wraps IPC failures as axios errors', async () => {
    const apiRequest = vi.fn().mockRejectedValue(new Error('service unavailable'))
    setElectronApi(apiRequest)

    const adapter = createElectronIpcAdapter('netease')

    await expect(
      adapter!({
        url: '/playlist/detail',
        method: 'get',
        params: { id: 1 }
      } as InternalAxiosRequestConfig)
    ).rejects.toSatisfy(error => axios.isAxiosError(error) && error.message === 'service unavailable')
  })

  it('preserves structured bridge failures as axios response metadata', async () => {
    const apiRequest = vi.fn().mockRejectedValue({
      message: 'QQ service request failed with status 500: Request failed with status code 500',
      code: 'ERR_BAD_RESPONSE',
      response: {
        status: 500,
        data: {
          error: {
            message: 'Request failed with status code 500'
          }
        }
      }
    })
    setElectronApi(apiRequest)

    const adapter = createElectronIpcAdapter('qq')

    await expect(
      adapter!({
        url: '/getSearchByKey',
        method: 'get',
        params: { key: 'jay' }
      } as InternalAxiosRequestConfig)
    ).rejects.toSatisfy(error => {
      if (!axios.isAxiosError(error)) {
        return false
      }

      return (
        error.code === 'ERR_BAD_RESPONSE' &&
        error.response?.status === 500 &&
        (error.response?.data as { error?: { message?: string } })?.error?.message ===
          'Request failed with status code 500'
      )
    })
  })
})
