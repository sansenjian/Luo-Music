import { INVOKE_CHANNELS, SEND_CHANNELS, isValidSendChannel } from '../shared/protocol/channels.ts'
import type { CacheClearOptions, CacheClearResult } from '../shared/protocol/cache.ts'
import type { ServiceStatusResponse } from '../ipc/types'

type ChannelBridge = {
  send(channel: string, ...args: unknown[]): void
  on(channel: string, callback: (...args: unknown[]) => void): () => void
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
}

type WindowBridge = {
  minimize(): void
  toggleMaximize(): void
  close(): void
}

type ApiRequestResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
  errorDetails?: ApiRequestErrorDetails
}

type ApiRequestErrorDetails = {
  code?: string
  status?: number
  responseData?: unknown
  reason?: string
}

type SerializedApiRequestError = {
  message: string
  name: 'ApiRequestError'
  code?: string
  response?: {
    status?: number
    data?: unknown
  }
  reason?: string
}

export interface ElectronAPI {
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  resizeWindow: (dims: { width: number; height: number }) => void
  getCacheSize: () => Promise<{ httpCache: number; httpCacheFormatted: string; note?: string }>
  clearCache: (options?: CacheClearOptions) => Promise<CacheClearResult>
  clearAllCache: (keepUserData?: boolean) => Promise<CacheClearResult>
  getCachePaths: () => Promise<Record<string, string>>
  apiRequest: <T = unknown>(
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ) => Promise<T>
  getServices: () => Promise<string[]>
  getServiceStatus: (serviceId: string) => Promise<ServiceStatusResponse>
  startService: (serviceId: string) => Promise<void>
  stopService: (serviceId: string) => Promise<void>
  sendPlayingState: (playing: boolean) => void
  sendPlayModeChange: (mode: number) => void
  supportsSendChannel: (channel: string) => boolean
  moveWindow: (x: number, y: number) => void
  send: (channel: string, data: unknown) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/^\/+/, '')
}

function toApiRequestError(
  service: string,
  endpoint: string,
  result: ApiRequestResult<unknown>
): SerializedApiRequestError {
  const error: SerializedApiRequestError = {
    name: 'ApiRequestError',
    message: result.error || `API request failed: ${service}:${endpoint}`
  }
  const details = result.errorDetails

  if (!details) {
    return error
  }

  if (details.code) {
    error.code = details.code
  }

  if (details.status !== undefined || details.responseData !== undefined) {
    error.response = {
      status: details.status,
      data: details.responseData
    }
  }

  if (details.reason) {
    error.reason = details.reason
  }

  return error
}

async function unwrapApiRequest<T>(
  ipc: ChannelBridge,
  service: string,
  endpoint: string,
  params: Record<string, unknown>
): Promise<T> {
  const result = await ipc.invoke<ApiRequestResult<T>>(INVOKE_CHANNELS.API_REQUEST, {
    service,
    endpoint: normalizeEndpoint(endpoint),
    params
  })

  if (!result.success) {
    throw toApiRequestError(service, endpoint, result)
  }

  return result.data as T
}

export function createLegacyElectronAPI(
  windowBridge: WindowBridge,
  ipc: ChannelBridge
): ElectronAPI {
  return {
    minimizeWindow: () => windowBridge.minimize(),
    maximizeWindow: () => windowBridge.toggleMaximize(),
    closeWindow: () => windowBridge.close(),
    resizeWindow: (dims: { width: number; height: number }) =>
      ipc.send(SEND_CHANNELS.WINDOW_RESIZE, dims),
    getCacheSize: () => ipc.invoke(INVOKE_CHANNELS.CACHE_GET_SIZE),
    clearCache: (options: CacheClearOptions = {}) => ipc.invoke(INVOKE_CHANNELS.CACHE_CLEAR, options),
    clearAllCache: (keepUserData?: boolean) =>
      ipc.invoke(INVOKE_CHANNELS.CACHE_CLEAR_ALL, keepUserData),
    getCachePaths: () => ipc.invoke(INVOKE_CHANNELS.CACHE_GET_PATHS),
    apiRequest: <T = unknown>(service: string, endpoint: string, params: Record<string, unknown>) =>
      unwrapApiRequest<T>(ipc, service, endpoint, params),
    getServices: () => ipc.invoke<string[]>(INVOKE_CHANNELS.API_GET_SERVICES),
    getServiceStatus: (serviceId: string) =>
      ipc.invoke<ServiceStatusResponse>(INVOKE_CHANNELS.SERVICE_GET_STATUS, serviceId),
    startService: (serviceId: string) => ipc.invoke<void>(INVOKE_CHANNELS.SERVICE_START, serviceId),
    stopService: (serviceId: string) => ipc.invoke<void>(INVOKE_CHANNELS.SERVICE_STOP, serviceId),
    sendPlayingState: (playing: boolean) => ipc.send(SEND_CHANNELS.MUSIC_PLAYING_CHECK, playing),
    sendPlayModeChange: (mode: number) => ipc.send(SEND_CHANNELS.MUSIC_PLAYMODE_TRAY_CHANGE, mode),
    supportsSendChannel: (channel: string) => isValidSendChannel(channel),
    moveWindow: (x: number, y: number) => ipc.send(SEND_CHANNELS.DESKTOP_LYRIC_MOVE, { x, y }),
    send: (channel: string, data: unknown) => ipc.send(channel, data),
    on: (channel: string, callback: (...args: unknown[]) => void) => ipc.on(channel, callback)
  }
}
