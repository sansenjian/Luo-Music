import { describe, expect, it, vi } from 'vitest'

import { createLegacyElectronAPI } from '../../electron/sandbox/legacyElectronApi'

describe('legacyElectronApi', () => {
  it('routes apiRequest through the generic API gateway and unwraps the payload', async () => {
    const windowBridge = {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn()
    }
    const ipc = {
      send: vi.fn(),
      on: vi.fn(),
      invoke: vi.fn().mockResolvedValue({
        success: true,
        data: { songs: ['jay'] }
      })
    }

    const api = createLegacyElectronAPI(windowBridge, ipc)
    const result = await api.apiRequest('qq', '/search', { keyword: 'jay' })

    expect(result).toEqual({ songs: ['jay'] })
    expect(ipc.invoke).toHaveBeenCalledWith('api:request', {
      service: 'qq',
      endpoint: 'search',
      params: { keyword: 'jay' }
    })
  })

  it('throws when the generic API gateway reports failure', async () => {
    const api = createLegacyElectronAPI(
      {
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn()
      },
      {
        send: vi.fn(),
        on: vi.fn(),
        invoke: vi.fn().mockResolvedValue({
          success: false,
          error: 'service unavailable'
        })
      }
    )

    await expect(api.apiRequest('netease', '/playlist/detail', { id: 1 })).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'service unavailable'
    })
  })

  it('preserves structured API gateway error details', async () => {
    const api = createLegacyElectronAPI(
      {
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        close: vi.fn()
      },
      {
        send: vi.fn(),
        on: vi.fn(),
        invoke: vi.fn().mockResolvedValue({
          success: false,
          error: 'timed out',
          errorDetails: {
            code: 'ECONNABORTED',
            status: 504,
            responseData: { traceId: 'abc' }
          }
        })
      }
    )

    await expect(api.apiRequest('netease', '/playlist/detail', { id: 1 })).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'timed out',
      code: 'ECONNABORTED',
      response: {
        status: 504,
        data: { traceId: 'abc' }
      }
    })
  })
})
