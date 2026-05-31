import type { Pinia } from 'pinia'

import type { StandardImportedAuthSession } from '@plugin-sdk'
import { usesLegacyLoginBridge, type LegacyLoginPlatformId } from '@/platform/music/loginRouting'
import { services } from '@/services'
import type { PluginService } from '@/services/pluginService'
import { useUserStore, type UserInfo } from '@/store/userStore'

type LegacyPlatformId = LegacyLoginPlatformId

export type LegacyPlatformAuthDeps = {
  getPluginService?: () => Pick<PluginService, 'auth'>
}

const defaultLegacyPlatformAuthDeps: Required<LegacyPlatformAuthDeps> = {
  getPluginService: () => services.plugins()
}

let legacyPlatformAuthDeps = defaultLegacyPlatformAuthDeps

export function configureLegacyPlatformAuthDeps(deps: LegacyPlatformAuthDeps): void {
  legacyPlatformAuthDeps = {
    ...legacyPlatformAuthDeps,
    ...deps
  }
}

export function resetLegacyPlatformAuthDeps(): void {
  legacyPlatformAuthDeps = defaultLegacyPlatformAuthDeps
}

function syncLegacyPlatformLogout(platformId: LegacyPlatformId, pinia?: Pinia): void {
  const userStore = useUserStore(pinia)

  if (platformId === 'qq') {
    userStore.logoutQQ()
  } else {
    userStore.logout()
  }

  userStore.clearPlatformAuthState(platformId)
}

function createNeteaseImportedAccount(userInfo: UserInfo): StandardImportedAuthSession['account'] {
  return {
    id: userInfo.userId ?? userInfo.nickname ?? 'netease',
    nickname: userInfo.nickname ?? userInfo.name ?? 'Netease',
    ...(userInfo.avatarUrl ? { avatarUrl: userInfo.avatarUrl } : {})
  }
}

function normalizePlatformIds(platformIds: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(platformIds)
        .map(platformId => platformId.trim())
        .filter(Boolean)
    )
  )
}

async function clearPluginAuthState(platformId: string, pinia?: Pinia): Promise<void> {
  try {
    const state = await legacyPlatformAuthDeps.getPluginService().auth.logout(platformId)
    useUserStore(pinia).setPlatformAuthState(state, platformId)
  } catch {
    // Legacy cookie cleanup should not be blocked by plugin secret cleanup failures.
  }
}

export async function logoutLegacyPlatform(
  platformId: LegacyPlatformId,
  pinia?: Pinia
): Promise<void> {
  syncLegacyPlatformLogout(platformId, pinia)
  await clearPluginAuthState(platformId, pinia)
}

export function clearLegacyPlatformSession(platformId: LegacyPlatformId, pinia?: Pinia): void {
  syncLegacyPlatformLogout(platformId, pinia)
  void clearPluginAuthState(platformId, pinia)
}

export function createLegacyImportedSession(
  platformId: string,
  pinia?: Pinia
): StandardImportedAuthSession | null {
  if (!usesLegacyLoginBridge(platformId)) {
    return null
  }

  const userStore = useUserStore(pinia)

  if (platformId === 'netease') {
    const cookie = userStore.cookie.trim()
    if (!cookie) {
      return null
    }

    return {
      credential: {
        type: 'cookie',
        value: cookie
      },
      ...(userStore.userInfo ? { account: createNeteaseImportedAccount(userStore.userInfo) } : {})
    }
  }

  const cookie = userStore.qqCookie.trim()
  if (!cookie) {
    return null
  }

  return {
    credential: {
      type: 'cookie',
      value: cookie
    }
  }
}

export async function clearPlatformAuthSessions(
  platformIds: Iterable<string>,
  pinia?: Pinia
): Promise<void> {
  const userStore = useUserStore(pinia)
  userStore.logout()
  userStore.logoutQQ()
  userStore.clearAllPlatformAuthStates()

  await Promise.all(
    normalizePlatformIds(platformIds).map(platformId => clearPluginAuthState(platformId, pinia))
  )
}
