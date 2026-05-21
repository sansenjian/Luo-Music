import type { Pinia } from 'pinia'

import { services } from '@/services'
import type { PluginService } from '@/services/pluginService'
import { useUserStore } from '@/store/userStore'

type LegacyPlatformId = 'netease' | 'qq'

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
