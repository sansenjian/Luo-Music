import type { PlatformDescriptor } from '@shared/types/platform'

export type PlatformLoginRoute =
  | { kind: 'plugin'; platform: PlatformDescriptor }
  | { kind: 'legacy'; platformId: LegacyLoginPlatformId; bridge: LegacyLoginBridge }

const LEGACY_LOGIN_PLATFORMS = ['netease', 'qq'] as const
export type LegacyLoginPlatformId = (typeof LEGACY_LOGIN_PLATFORMS)[number]
export type LegacyLoginBridge = 'netease-login-modal' | 'qq-login-modal'

const legacyLoginBridgeByPlatform: Record<LegacyLoginPlatformId, LegacyLoginBridge> = {
  netease: 'netease-login-modal',
  qq: 'qq-login-modal'
}
const primaryProfilePlatformId: LegacyLoginPlatformId = 'netease'
const legacyLoginPlatformIds = new Set<string>(LEGACY_LOGIN_PLATFORMS)

export function usesLegacyLoginBridge(platformId: string): platformId is LegacyLoginPlatformId {
  return legacyLoginPlatformIds.has(platformId)
}

export function resolveLegacyLoginBridge(platformId: LegacyLoginPlatformId): LegacyLoginBridge {
  return legacyLoginBridgeByPlatform[platformId]
}

export function getLegacyLoginBridgePlatformId(bridge: LegacyLoginBridge): LegacyLoginPlatformId {
  const entry = Object.entries(legacyLoginBridgeByPlatform).find(
    ([, candidateBridge]) => candidateBridge === bridge
  )

  if (!entry) {
    throw new Error(`Unsupported legacy login bridge: ${bridge}`)
  }

  return entry[0] as LegacyLoginPlatformId
}

export function getPrimaryProfilePlatformId(): LegacyLoginPlatformId {
  return primaryProfilePlatformId
}

export function isPlatformRepresentedByPrimaryProfile(platformId: string): boolean {
  return platformId === primaryProfilePlatformId
}

export function resolvePlatformLoginRoute(platform: PlatformDescriptor): PlatformLoginRoute {
  if (usesLegacyLoginBridge(platform.id)) {
    return {
      kind: 'legacy',
      platformId: platform.id,
      bridge: resolveLegacyLoginBridge(platform.id)
    }
  }

  return {
    kind: 'plugin',
    platform
  }
}
