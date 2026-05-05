import type { ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

import { useExperimentalFeatures } from '@/composables/useExperimentalFeatures'
import { useMediaSession, type MediaSessionDeps } from '@/composables/useMediaSession'
import { services } from '@/services'
import type { PlatformService } from '@/services/platformService'
import { playerCore } from '@/utils/player/core/playerCore'

export const DESKTOP_LYRIC_ROUTE_PATH = '/desktop-lyric'

type RouteLike = {
  path: string
}

type SmtcFeatureState = {
  smtcEnabled: ComputedRef<boolean> | { readonly value: boolean }
}

type SystemMediaSessionController = NonNullable<MediaSessionDeps['systemMediaSessionController']>

export type SmtcExtensionDeps = {
  route?: RouteLike
  experimentalFeatures?: SmtcFeatureState
  platformService?: Pick<PlatformService, 'isElectron'>
  systemMediaSessionController?: SystemMediaSessionController
  getLocationHash?: () => string
  registerMediaSession?: (deps: MediaSessionDeps) => void
}

function getDefaultLocationHash(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.hash
}

export function isSmtcPrimaryWindow(routePath: string, locationHash: string): boolean {
  return (
    routePath !== DESKTOP_LYRIC_ROUTE_PATH &&
    !locationHash.startsWith(`#${DESKTOP_LYRIC_ROUTE_PATH}`)
  )
}

export function useSmtcExtension(deps: SmtcExtensionDeps = {}): void {
  const platformService = deps.platformService ?? services.platform()

  if (!platformService.isElectron()) {
    return
  }

  const route = deps.route ?? useRoute()
  const experimentalFeatures = deps.experimentalFeatures ?? useExperimentalFeatures()
  const getLocationHash = deps.getLocationHash ?? getDefaultLocationHash
  const registerMediaSession = deps.registerMediaSession ?? useMediaSession
  const systemMediaSessionController = deps.systemMediaSessionController ?? playerCore

  function isEnabled(): boolean {
    return (
      experimentalFeatures.smtcEnabled.value && isSmtcPrimaryWindow(route.path, getLocationHash())
    )
  }

  registerMediaSession({
    enabled: isEnabled,
    systemMediaSessionController
  })
}
