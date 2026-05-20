import type { Pinia } from 'pinia'

import { configureNeteaseServiceApiDeps } from '@/api/shared/neteaseServiceRequest'
import { useUserStore } from '@/store/userStore'

export function installNeteaseServiceApiAuthInvalidation(pinia: Pinia): void {
  configureNeteaseServiceApiDeps({
    onAuthExpired: () => {
      useUserStore(pinia).logout()
    }
  })
}
