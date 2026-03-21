import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
  buildTransportPayload,
  normalizeEndpoint,
  type ApiServiceId
} from './transportShared'

type ElectronApiBridge = {
  apiRequest?: (
    service: string,
    endpoint: string,
    params: Record<string, unknown>
  ) => Promise<unknown>
}

type BridgeRequestError = {
  message?: unknown
  code?: unknown
  reason?: unknown
  status?: unknown
  responseData?: unknown
  response?: {
    status?: unknown
    data?: unknown
  }
  cause?: unknown
}

function getBridgeErrorLike(error: unknown): BridgeRequestError | null {
  return error && typeof error === 'object' ? (error as BridgeRequestError) : null
}

function inferStatusFromMessage(message: string | undefined): number | undefined {
  if (!message) {
    return undefined
  }

  const match = message.match(/\bstatus\s+(\d{3})\b/i)
  if (!match) {
    return undefined
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function getBridgeErrorMessage(error: unknown): string | null {
  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }

  const message = getBridgeErrorLike(error)?.message
  return typeof message === 'string' && message.length > 0 ? message : null
}

function getElectronApiBridge(): ElectronApiBridge | null {
  if (typeof window === 'undefined') {
    return null
  }

  const electronAPI = (window as typeof window & { electronAPI?: ElectronApiBridge }).electronAPI
  return electronAPI && typeof electronAPI.apiRequest === 'function' ? electronAPI : null
}

function applyBridgeErrorMetadata(
  axiosError: AxiosError,
  config: InternalAxiosRequestConfig,
  error: unknown
): void {
  if (!error || typeof error !== 'object') {
    const inferredStatus = inferStatusFromMessage(getBridgeErrorMessage(error) ?? undefined)
    if (inferredStatus !== undefined) {
      axiosError.response = {
        data: undefined,
        status: inferredStatus,
        statusText: String(inferredStatus),
        headers: {},
        config,
        request: undefined
      }
    }
    return
  }

  const bridgeError = error as BridgeRequestError
  const cause = getBridgeErrorLike(bridgeError.cause)

  const code =
    typeof bridgeError.code === 'string'
      ? bridgeError.code
      : typeof cause?.code === 'string'
        ? cause.code
        : undefined
  if (code) {
    axiosError.code = code
  }

  const reason =
    typeof bridgeError.reason === 'string'
      ? bridgeError.reason
      : typeof cause?.reason === 'string'
        ? cause.reason
        : undefined
  if (reason) {
    ;(axiosError as AxiosError & { reason?: string }).reason = reason
  }

  const status = [
    bridgeError.response?.status,
    bridgeError.status,
    cause?.response?.status,
    cause?.status,
    inferStatusFromMessage(getBridgeErrorMessage(error) ?? undefined)
  ].find(value => typeof value === 'number') as number | undefined
  const data =
    bridgeError.response?.data ??
    bridgeError.responseData ??
    cause?.response?.data ??
    cause?.responseData

  if (status !== undefined || data !== undefined) {
    axiosError.response = {
      data,
      status: status ?? 0,
      statusText: status !== undefined ? String(status) : 'IPC_ERROR',
      headers: {},
      config,
      request: undefined
    }
  }
}

export function createElectronIpcAdapter(service: ApiServiceId): AxiosAdapter | null {
  const bridge = getElectronApiBridge()
  const apiRequest = bridge?.apiRequest
  if (!apiRequest) {
    return null
  }

  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const endpoint = normalizeEndpoint(config.url)

    try {
      const data = await apiRequest(service, endpoint, buildTransportPayload(config))

      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: undefined
      }
    } catch (error) {
      const message = getBridgeErrorMessage(error) ?? 'Electron IPC request failed'
      const axiosError = new AxiosError(message, 'ERR_BAD_RESPONSE', config)
      applyBridgeErrorMetadata(axiosError, config, error)
      axiosError.cause = error instanceof Error ? error : new Error(String(error))
      throw axiosError
    }
  }
}

export function hasElectronIpcRequestSupport(): boolean {
  return getElectronApiBridge() !== null
}
