import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios'

import { normalizeApiError } from '../error/normalize'
import { createElectronIpcAdapter } from './electronIpcRequest'
import { normalizeRequestParams, type ApiServiceId } from './transportShared'
import { isCanceledRequestError } from './cancelError'
import {
  HTTP_COOKIE_CACHE_TTL,
  HTTP_DEFAULT_RETRY_COUNT,
  HTTP_DEFAULT_RETRY_DELAY,
  HTTP_DEFAULT_TIMEOUT
} from '@/constants/http'
import { services } from '@/services'
import type { ErrorService } from '@/services/errorService'

type ErrorServiceLike = Pick<ErrorService, 'emit'>

export type TransportRequestParams = Record<string, unknown>

export type TransportRequestConfig = InternalAxiosRequestConfig & {
  cache?: boolean
  cacheNamespace?: string
  skipCache?: boolean
  cancel?: boolean
  retry?: number | false
  retryDelay?: number
  retryCount?: number
  params?: TransportRequestParams
}

export interface CachedCookieResolver {
  getCookie: () => string | null
  clear: () => void
}

export interface TransportCookieOptions {
  resolver: CachedCookieResolver
  headerName?: string
  paramName?: string
  injectIntoHeaders?: boolean
  injectIntoParams?: boolean
}

export interface TransportFactoryOptions {
  service: ApiServiceId
  baseURL: string | (() => string | Promise<string>)
  timeout?: number
  withCredentials?: boolean | (() => boolean)
  retry?: number | false
  retryDelay?: number
  unwrapData?: boolean
  emitErrors?: boolean
  cookie?: TransportCookieOptions
  extend?: (client: AxiosInstance) => void
}

type TransportFactoryDeps = {
  getErrorService: () => ErrorServiceLike
}

const defaultTransportFactoryDeps: TransportFactoryDeps = {
  getErrorService: () => services.error()
}

let transportFactoryDeps: TransportFactoryDeps = defaultTransportFactoryDeps
let cachedErrorService: ErrorServiceLike | null = null

export function configureTransportFactoryDeps(deps: Partial<TransportFactoryDeps>): void {
  transportFactoryDeps = {
    ...transportFactoryDeps,
    ...deps
  }
  cachedErrorService = null
}

export function resetTransportFactoryDeps(): void {
  transportFactoryDeps = defaultTransportFactoryDeps
  cachedErrorService = null
}

function getErrorService(): ErrorServiceLike {
  if (!cachedErrorService) {
    cachedErrorService = transportFactoryDeps.getErrorService()
  }

  return cachedErrorService
}

function resolveConfigValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

function isSameAdapterValue(
  currentAdapter: AxiosRequestConfig['adapter'],
  defaultAdapter: AxiosRequestConfig['adapter']
): boolean {
  if (currentAdapter === defaultAdapter) {
    return true
  }

  if (Array.isArray(currentAdapter) && Array.isArray(defaultAdapter)) {
    return (
      currentAdapter.length === defaultAdapter.length &&
      currentAdapter.every((value, index) => value === defaultAdapter[index])
    )
  }

  return false
}

function shouldAttachElectronAdapter(
  currentAdapter: AxiosRequestConfig['adapter'],
  defaultAdapter: AxiosRequestConfig['adapter']
): boolean {
  if (currentAdapter === undefined) {
    return true
  }

  return isSameAdapterValue(currentAdapter, defaultAdapter)
}

async function resolveBaseURL(baseURL: string | (() => string | Promise<string>)): Promise<string> {
  return typeof baseURL === 'function' ? await baseURL() : baseURL
}

function injectCookie(config: TransportRequestConfig, options: TransportCookieOptions): void {
  const cookie = options.resolver.getCookie()
  if (!cookie) {
    return
  }

  if (options.injectIntoParams !== false) {
    const paramName = options.paramName ?? 'cookie'
    const params = normalizeRequestParams(config.params)
    if (typeof params[paramName] !== 'string' || params[paramName].length === 0) {
      params[paramName] = cookie
    }
    config.params = params
  }

  if (options.injectIntoHeaders) {
    const headerName = options.headerName ?? 'X-Custom-Cookie'
    const headers = AxiosHeaders.from(config.headers ?? {})

    if (!headers.has(headerName)) {
      headers.set(headerName, cookie)
    }

    config.headers = headers
  }
}

export function createCachedCookieResolver(
  readCookie: () => string | null,
  ttl: number = HTTP_COOKIE_CACHE_TTL
): CachedCookieResolver {
  let cachedCookie: string | null = null
  let lastCookieCheck = 0

  return {
    getCookie() {
      const now = Date.now()
      if (cachedCookie !== null && now - lastCookieCheck < ttl) {
        return cachedCookie
      }

      try {
        cachedCookie = readCookie() || null
      } catch {
        cachedCookie = null
      }

      lastCookieCheck = now
      return cachedCookie
    },
    clear() {
      cachedCookie = null
      lastCookieCheck = 0
    }
  }
}

export function createTransport(options: TransportFactoryOptions): AxiosInstance {
  const request = axios.create({
    baseURL: typeof options.baseURL === 'string' ? options.baseURL : undefined,
    timeout: options.timeout ?? HTTP_DEFAULT_TIMEOUT,
    withCredentials: options.withCredentials ? resolveConfigValue(options.withCredentials) : false,
    retry: options.retry ?? HTTP_DEFAULT_RETRY_COUNT,
    retryDelay: options.retryDelay ?? HTTP_DEFAULT_RETRY_DELAY
  } as AxiosRequestConfig)

  request.interceptors.request.use(async config => {
    const requestConfig = config as TransportRequestConfig

    requestConfig.params = normalizeRequestParams(requestConfig.params)

    if (!requestConfig.baseURL) {
      requestConfig.baseURL = await resolveBaseURL(options.baseURL)
    }

    const electronIpcAdapter = createElectronIpcAdapter(options.service)
    if (
      electronIpcAdapter &&
      shouldAttachElectronAdapter(requestConfig.adapter, request.defaults.adapter)
    ) {
      requestConfig.adapter = electronIpcAdapter
    }

    if (options.cookie) {
      injectCookie(requestConfig, options.cookie)
    }

    return requestConfig
  })

  options.extend?.(request)

  request.interceptors.response.use(
    response => (options.unwrapData ? response.data : response),
    error => {
      // 取消错误直接返回，保持取消语义
      if (isCanceledRequestError(error)) {
        return Promise.reject(error)
      }

      const appError = normalizeApiError(error, undefined, { url: error?.config?.url })

      if (options.emitErrors) {
        const errorService = getErrorService()
        errorService.emit(appError)
      }

      return Promise.reject(appError)
    }
  )

  return request
}

export function createStaticResponse(
  config: TransportRequestConfig,
  data: unknown,
  status: number = 200
): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: {},
    config,
    request: undefined
  }
}
