import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createCachedCookieResolver,
  createTransport,
  configureTransportFactoryDeps,
  resetTransportFactoryDeps
} from '@/utils/http/transportFactory'
import { AppError, ErrorCode } from '@/utils/error/types'
import { createCanceledRequestError, isCanceledRequestError } from '@/utils/http/cancelError'

function setElectronApi(
  apiRequest?: (
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ) => Promise<unknown>
) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: apiRequest ? { apiRequest } : undefined
  })
}

describe('transportFactory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setElectronApi()
    resetTransportFactoryDeps()
  })

  it('injects normalized params and cookies into HTTP requests', async () => {
    const transport = createTransport({
      service: 'qq',
      baseURL: '/qq-api',
      cookie: {
        resolver: createCachedCookieResolver(() => 'qq-cookie'),
        injectIntoParams: true,
        injectIntoHeaders: true,
        headerName: 'X-Custom-Cookie'
      },
      unwrapData: true
    })

    const response = await transport.get('/search', {
      params: {
        keyword: 'jay',
        empty: undefined
      },
      adapter: async (config: InternalAxiosRequestConfig) => ({
        data: {
          params: config.params,
          headers: AxiosHeaders.from(config.headers).toJSON()
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: undefined
      })
    })

    expect(response).toEqual({
      params: {
        keyword: 'jay',
        cookie: 'qq-cookie'
      },
      headers: expect.objectContaining({
        'X-Custom-Cookie': 'qq-cookie'
      })
    })
  })

  it('attaches the shared IPC transport when the Electron bridge is available', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ ok: true })
    setElectronApi(apiRequest)

    const transport = createTransport({
      service: 'netease',
      baseURL: '/api',
      cookie: {
        resolver: createCachedCookieResolver(() => 'netease-cookie'),
        injectIntoParams: true
      },
      unwrapData: true
    })

    const requestHandlers = (
      transport.interceptors.request as unknown as {
        handlers: Array<{
          fulfilled?: (
            config: InternalAxiosRequestConfig
          ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
        }>
      }
    ).handlers
    const requestInterceptor = requestHandlers.at(-1)?.fulfilled

    const config = await requestInterceptor?.({
      url: '/cloudsearch',
      method: 'get',
      params: {
        keywords: 'jay',
        skip: undefined
      }
    } as InternalAxiosRequestConfig)

    expect(config?.params).toEqual({
      keywords: 'jay',
      cookie: 'netease-cookie'
    })
    expect(config?.adapter).toBeTypeOf('function')

    const adapter = config?.adapter as
      | ((requestConfig: InternalAxiosRequestConfig) => Promise<{ data: unknown }>)
      | undefined
    const response = await adapter?.(config as InternalAxiosRequestConfig)
    expect(apiRequest).toHaveBeenCalledWith('netease', 'cloudsearch', {
      keywords: 'jay',
      cookie: 'netease-cookie'
    })
    expect(response?.data).toEqual({ ok: true })
  })

  it('replaces the default axios adapter with the Electron IPC transport', async () => {
    const apiRequest = vi.fn().mockResolvedValue({ ok: true })
    setElectronApi(apiRequest)

    const transport = createTransport({
      service: 'qq',
      baseURL: '/qq-api',
      unwrapData: true
    })

    const requestHandlers = (
      transport.interceptors.request as unknown as {
        handlers: Array<{
          fulfilled?: (
            config: InternalAxiosRequestConfig
          ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
        }>
      }
    ).handlers
    const requestInterceptor = requestHandlers.at(-1)?.fulfilled

    const config = await requestInterceptor?.({
      url: '/getSearchByKey',
      method: 'get',
      adapter: transport.defaults.adapter,
      params: {
        key: 'jay'
      }
    } as InternalAxiosRequestConfig)

    expect(config?.adapter).toBeTypeOf('function')
    expect(config?.adapter).not.toBe(transport.defaults.adapter)

    const response = (await (
      config?.adapter as ((config: InternalAxiosRequestConfig) => Promise<unknown>) | undefined
    )?.(config as InternalAxiosRequestConfig)) as { data: unknown }
    expect(apiRequest).toHaveBeenCalledWith('qq', 'getSearchByKey', {
      key: 'jay'
    })
    expect(response?.data).toEqual({ ok: true })
  })

  it('keeps an explicit custom adapter instead of overriding it with the IPC transport', async () => {
    const apiRequest = vi.fn()
    const customAdapter = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
      request: undefined
    })
    setElectronApi(apiRequest)

    const transport = createTransport({
      service: 'qq',
      baseURL: '/qq-api',
      unwrapData: true
    })

    const requestHandlers = (
      transport.interceptors.request as unknown as {
        handlers: Array<{
          fulfilled?: (
            config: InternalAxiosRequestConfig
          ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
        }>
      }
    ).handlers
    const requestInterceptor = requestHandlers.at(-1)?.fulfilled

    const config = await requestInterceptor?.({
      url: '/getSearchByKey',
      method: 'get',
      adapter: customAdapter,
      params: {
        key: 'jay'
      },
      headers: new AxiosHeaders()
    } as unknown as InternalAxiosRequestConfig)

    expect(config?.adapter).toBe(customAdapter)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('normalizes transport failures into AppError instances', async () => {
    const transport = createTransport({
      service: 'netease',
      baseURL: '/api',
      unwrapData: true
    })

    await expect(
      transport.get('/playlist/detail', {
        adapter: async (config: InternalAxiosRequestConfig) => {
          throw new AxiosError('offline', 'ERR_NETWORK', config)
        }
      })
    ).rejects.toMatchObject({
      name: 'AppError',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'offline'
    } satisfies Partial<AppError>)
  })

  it('caches cookie reads until explicitly cleared', () => {
    let cookie = 'first'
    const resolver = createCachedCookieResolver(() => cookie)

    expect(resolver.getCookie()).toBe('first')

    cookie = 'second'
    expect(resolver.getCookie()).toBe('first')

    resolver.clear()
    expect(resolver.getCookie()).toBe('second')
  })

  it('preserves canceled request errors without re-wrapping them into AppError', async () => {
    const transport = createTransport({
      service: 'netease',
      baseURL: '/api',
      unwrapData: true
    })

    const canceledError = createCanceledRequestError('manual', 'canceled')

    await expect(
      transport.get('/playlist/detail', {
        adapter: async () => {
          throw canceledError
        }
      })
    ).rejects.toSatisfy((err: unknown) => {
      // 应该是原始的取消错误，而不是被包装成 AppError
      return isCanceledRequestError(err)
    })
  })

  it('emits normalized errors through an injected error service resolver', async () => {
    const emit = vi.fn()
    configureTransportFactoryDeps({
      getErrorService: () => ({ emit })
    })

    const transport = createTransport({
      service: 'netease',
      baseURL: '/api',
      unwrapData: true,
      emitErrors: true
    })

    await expect(
      transport.get('/playlist/detail', {
        adapter: async (config: InternalAxiosRequestConfig) => {
          throw new AxiosError('offline', 'ERR_NETWORK', config)
        }
      })
    ).rejects.toMatchObject({
      name: 'AppError',
      code: ErrorCode.SERVICE_UNAVAILABLE
    } satisfies Partial<AppError>)

    expect(emit).toHaveBeenCalledTimes(1)
  })
})
