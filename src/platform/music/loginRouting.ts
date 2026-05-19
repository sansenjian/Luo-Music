import type { PlatformDescriptor } from '@shared/types/platform'

export type PlatformLoginRoute =
  | { kind: 'plugin'; platform: PlatformDescriptor }
  | { kind: 'legacy'; platformId: 'netease' | 'qq' }

const legacyLoginPlatformIds = new Set(['netease', 'qq'])

export function usesLegacyLoginBridge(platformId: string): platformId is 'netease' | 'qq' {
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
