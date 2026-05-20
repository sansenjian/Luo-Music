import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { getHotSearch } from '@/api/search'
import {
  configureNeteaseServiceApiDeps,
  resetNeteaseServiceApiDeps
} from '@/api/shared/neteaseServiceRequest'
import { installNeteaseServiceApiAuthInvalidation } from '@/app/neteaseServiceApi'
import { useUserStore } from '@/store/userStore'

describe('installNeteaseServiceApiAuthInvalidation', () => {
  it('logs out the Netease user when the service API reports an expired session', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const userStore = useUserStore(pinia)
    userStore.login({ nickname: 'Tester', userId: 42 }, 'MUSIC_U=session')

    configureNeteaseServiceApiDeps({
      getApiService: () => ({
        request: () => Promise.resolve({ code: 301 })
      }),
      getCookie: () => 'MUSIC_U=session'
    })
    installNeteaseServiceApiAuthInvalidation(pinia)

    await getHotSearch()

    expect(userStore.isLoggedIn).toBe(false)
    expect(userStore.cookie).toBe('')

    resetNeteaseServiceApiDeps()
  })
})
