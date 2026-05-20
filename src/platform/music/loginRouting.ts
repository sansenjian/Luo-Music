import type { PlatformDescriptor } from '@shared/types/platform'

export type PlatformLoginRoute =
  | { kind: 'plugin'; platform: PlatformDescriptor }
  | { kind: 'legacy'; platformId: LegacyLoginPlatformId }

const LEGACY_LOGIN_PLATFORMS = ['netease', 'qq'] as const
type LegacyLoginPlatformId = (typeof LEGACY_LOGIN_PLATFORMS)[number]
const legacyLoginPlatformIds = new Set<string>(LEGACY_LOGIN_PLATFORMS)

export function usesLegacyLoginBridge(platformId: string): platformId is LegacyLoginPlatformId {
  return legacyLoginPlatformIds.has(platformId)
}

export function resolvePlatformLoginRoute(platform: PlatformDescriptor): PlatformLoginRoute {
  if (usesLegacyLoginBridge(platform.id)) {
    return {
      kind: 'legacy',
      platformId: platform.id
    }
  }

  return {
    kind: 'plugin',
    platform
  }
}
