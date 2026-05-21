import type { StandardAccountProfile, StandardAuthState } from '@plugin-sdk'

export type PlatformAuthStatus = StandardAuthState['status']

export type PlatformAuthAccount = StandardAccountProfile

export interface PlatformAuthState {
  platform: string
  status: PlatformAuthStatus
  account?: PlatformAuthAccount
  expiresAt?: number
  message?: string
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizePlatformId(value: unknown, fallback = 'unknown'): string {
  const platform = normalizeString(value).trim()
  const fallbackPlatform = normalizeString(fallback).trim()
  return platform || fallbackPlatform || 'unknown'
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeAuthStatus(value: unknown): PlatformAuthStatus {
  return value === 'anonymous' ||
    value === 'pending' ||
    value === 'authenticated' ||
    value === 'expired' ||
    value === 'error'
    ? value
    : 'anonymous'
}

function normalizeAccountId(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const id = normalizeString(value)
  return id ? id : undefined
}

function normalizeAccount(value: unknown): PlatformAuthAccount | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const id = normalizeAccountId(value.id)
  const nickname = normalizeString(value.nickname)

  if (id === undefined || !nickname) {
    return undefined
  }

  return {
    id,
    nickname,
    avatarUrl: normalizeString(value.avatarUrl) || undefined,
    homepageUrl: normalizeString(value.homepageUrl) || undefined,
    extra: isRecord(value.extra) ? { ...value.extra } : undefined
  }
}

export function createAnonymousPlatformAuthState(
  platform: string,
  message = '未登录'
): PlatformAuthState {
  return {
    platform: normalizePlatformId(platform),
    status: 'anonymous',
    message,
    updatedAt: Date.now()
  }
}

export function createErrorPlatformAuthState(
  platform: string,
  message = '登录状态异常'
): PlatformAuthState {
  return {
    platform: normalizePlatformId(platform),
    status: 'error',
    message,
    updatedAt: Date.now()
  }
}

export function normalizePlatformAuthState(
  value: unknown,
  fallbackPlatform: string
): PlatformAuthState {
  if (!isRecord(value)) {
    return createAnonymousPlatformAuthState(fallbackPlatform)
  }

  const platform = normalizePlatformId(value.platform, fallbackPlatform)

  return {
    platform,
    status: normalizeAuthStatus(value.status),
    account: normalizeAccount(value.account),
    expiresAt: normalizeNumber(value.expiresAt),
    message: normalizeString(value.message) || undefined,
    updatedAt: Date.now()
  }
}

export function isPlatformAuthStateAuthenticated(state: PlatformAuthState | undefined): boolean {
  return state?.status === 'authenticated'
}

export function getPlatformAuthStatusText(status: PlatformAuthStatus): string {
  switch (status) {
    case 'authenticated':
      return '已登录'
    case 'pending':
      return '登录中'
    case 'expired':
      return '已过期'
    case 'error':
      return '状态异常'
    case 'anonymous':
    default:
      return '未登录'
  }
}
