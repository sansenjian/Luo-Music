import { getPlatformDescriptor } from '@/platform/music/descriptors'

export interface PlatformDisplayInfo {
  badgeText: string
  className: string
  displayName: string
  id: string
}

const UNKNOWN_PLATFORM_ID = 'unknown'

function normalizePlatformId(platformId: string | null | undefined): string {
  const normalized = platformId?.trim()
  return normalized && normalized.length > 0 ? normalized : UNKNOWN_PLATFORM_ID
}

function formatToken(token: string): string {
  if (token.length <= 3) {
    return token.toUpperCase()
  }

  return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`
}

function formatPlatformIdAsName(platformId: string): string {
  return platformId
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map(formatToken)
    .join(' ')
}

function formatPlatformIdAsBadge(platformId: string): string {
  return platformId
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map(token => token.toUpperCase())
    .join(' ')
}

function createPlatformClassName(platformId: string): string {
  const classToken = platformId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return `platform-${classToken || UNKNOWN_PLATFORM_ID}`
}

export function getPlatformDisplayInfo(platformId: string | null | undefined): PlatformDisplayInfo {
  const id = normalizePlatformId(platformId)
  const descriptor = getPlatformDescriptor(id)
  const fallbackName = formatPlatformIdAsName(id)

  return {
    id,
    displayName: descriptor?.displayName ?? fallbackName,
    badgeText: formatPlatformIdAsBadge(id),
    className: createPlatformClassName(id)
  }
}
