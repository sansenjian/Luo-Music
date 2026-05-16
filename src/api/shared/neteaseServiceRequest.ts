import { services } from '@/services'
import type { ApiService } from '@/services/apiService'
import { storageAdapter } from '@/services/storageService'
import { HTTP_COOKIE_CACHE_TTL } from '@/constants/http'

type NeteaseApiClient = Pick<ApiService, 'request'>

export type NeteaseServiceApiDeps = {
  getApiService?: () => NeteaseApiClient
  getTimestamp?: () => number
  getCookie?: () => string | null
}

const defaultNeteaseServiceApiDeps: Required<NeteaseServiceApiDeps> = {
  getApiService: () => services.api(),
  getTimestamp: () => Date.now(),
  getCookie: () => {
    const rawUserState = storageAdapter.getItem('user')
    if (!rawUserState) {
      return null
    }

    try {
      const parsed = JSON.parse(rawUserState) as { cookie?: unknown }
      return typeof parsed.cookie === 'string' ? parsed.cookie : null
    } catch {
      return null
    }
  }
}

let neteaseServiceApiDeps: Required<NeteaseServiceApiDeps> = defaultNeteaseServiceApiDeps
let cachedCookie: string | null = null
let lastCookieCheck = 0

export function configureNeteaseServiceApiDeps(deps: NeteaseServiceApiDeps): void {
  neteaseServiceApiDeps = {
    ...neteaseServiceApiDeps,
    ...deps
  }
  clearNeteaseServiceCookieCache()
}

export function resetNeteaseServiceApiDeps(): void {
  neteaseServiceApiDeps = defaultNeteaseServiceApiDeps
  clearNeteaseServiceCookieCache()
}

export function clearNeteaseServiceCookieCache(): void {
  cachedCookie = null
  lastCookieCheck = 0
}

function getCachedCookie(): string | null {
  const now = Date.now()
  if (cachedCookie !== null && now - lastCookieCheck < HTTP_COOKIE_CACHE_TTL) {
    return cachedCookie
  }

  try {
    cachedCookie = neteaseServiceApiDeps.getCookie() || null
  } catch {
    cachedCookie = null
  }

  lastCookieCheck = now
  return cachedCookie
}

export function withTimestamp(params: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...params,
    timestamp: neteaseServiceApiDeps.getTimestamp()
  }
}

export function withCachedCookie(params: Record<string, unknown> = {}): Record<string, unknown> {
  const cookie = getCachedCookie()
  if (!cookie || typeof params.cookie === 'string') {
    return params
  }

  return {
    ...params,
    cookie
  }
}

export function neteaseRequest(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  return neteaseServiceApiDeps
    .getApiService()
    .request('netease', endpoint, withCachedCookie(params))
}
