import type { Pinia } from 'pinia'

import { configureNeteaseServiceApiDeps } from '@/api/shared/neteaseServiceRequest'
import { clearLegacyPlatformSession } from '@/app/legacyPlatformAuth'

export function installNeteaseServiceApiAuthInvalidation(pinia: Pinia): void {
  configureNeteaseServiceApiDeps({
    onAuthExpired: () => {
      clearLegacyPlatformSession('netease', pinia)
    }
  })
}
