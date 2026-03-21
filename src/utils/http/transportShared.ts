import type { InternalAxiosRequestConfig } from 'axios'

export type ApiServiceId = 'netease' | 'qq'

type RequestDataConfig = Pick<InternalAxiosRequestConfig, 'data' | 'params'>

export function isElectronRenderer(): boolean {
  return typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron')
}

export function normalizeEndpoint(endpoint: string | undefined): string {
  return String(endpoint ?? '').replace(/^\/+/, '')
}

export function toRequestRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  if (value instanceof URLSearchParams) {
    return Object.fromEntries(value.entries())
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const formDataRecord: Record<string, unknown> = {}
    value.forEach((entry, key) => {
      formDataRecord[key] = entry
    })
    return formDataRecord
  }

  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function normalizeRequestParams(params: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(toRequestRecord(params)).filter(([, value]) => value !== undefined)
  )
}

export function buildTransportPayload(config: RequestDataConfig): Record<string, unknown> {
  return {
    ...toRequestRecord(config.data),
    ...normalizeRequestParams(config.params)
  }
}
