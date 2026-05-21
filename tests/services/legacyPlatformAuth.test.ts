import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  configureLegacyPlatformAuthDeps,
  clearPlatformAuthSessions,
  clearLegacyPlatformSession,
  logoutLegacyPlatform,
  resetLegacyPlatformAuthDeps
} from '@/app/legacyPlatformAuth'
import { useUserStore } from '@/store/userStore'

const pluginLogoutMock = vi.fn()
const pluginAuthMock = {
  getState: vi.fn(),
  startLogin: vi.fn(),
  pollLogin: vi.fn(),
  submitLogin: vi.fn(),
  cancelLogin: vi.fn(),
  importSession: vi.fn(),
  refresh: vi.fn(),
  logout: pluginLogoutMock
}

describe('legacyPlatformAuth', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    configureLegacyPlatformAuthDeps({
      getPluginService: () => ({
        auth: pluginAuthMock
      })
    })
  })

  afterEach(() => {
    resetLegacyPlatformAuthDeps()
  })

  it('clears local Netease login and plugin auth state when legacy logout runs', async () => {
    const userStore = useUserStore()
    userStore.login({ nickname: 'Tester', userId: 42 }, 'MUSIC_U=legacy')
    userStore.setPlatformAuthState({
      platform: 'netease',
      status: 'authenticated'
    })
    pluginLogoutMock.mockResolvedValue({
      platform: 'netease',
      status: 'anonymous',
      message: '已退出登录'
    })

    await logoutLegacyPlatform('netease')

    expect(userStore.isLoggedIn).toBe(false)
    expect(userStore.cookie).toBe('')
    expect(userStore.isPlatformAuthenticated('netease')).toBe(false)
    expect(pluginLogoutMock).toHaveBeenCalledWith('netease')
  })

  it('keeps local logout successful when plugin auth logout fails', async () => {
    const userStore = useUserStore()
    userStore.setQQCookie('qq-cookie')
    userStore.setPlatformAuthState({
      platform: 'qq',
      status: 'authenticated'
    })
    pluginLogoutMock.mockRejectedValue(new Error('plugin unavailable'))

    await logoutLegacyPlatform('qq')

    expect(userStore.qqCookie).toBe('')
    expect(userStore.isPlatformAuthenticated('qq')).toBe(false)
  })

  it('starts plugin cleanup when clearing a stale legacy session', async () => {
    const userStore = useUserStore()
    userStore.login({ nickname: 'Tester', userId: 42 }, 'MUSIC_U=legacy')
    pluginLogoutMock.mockResolvedValue({
      platform: 'netease',
      status: 'anonymous'
    })

    clearLegacyPlatformSession('netease')
    await vi.waitFor(() => expect(pluginLogoutMock).toHaveBeenCalledWith('netease'))

    expect(userStore.isLoggedIn).toBe(false)
    expect(userStore.isPlatformAuthenticated('netease')).toBe(false)
  })

  it('clears local and plugin auth state for all provided platforms', async () => {
    const userStore = useUserStore()
    userStore.login({ nickname: 'Tester', userId: 42 }, 'MUSIC_U=legacy')
    userStore.setQQCookie('qq-cookie')
    userStore.setPlatformAuthState({
      platform: 'kugou',
      status: 'authenticated'
    })
    pluginLogoutMock.mockImplementation(platformId =>
      Promise.resolve({
        platform: platformId,
        status: 'anonymous'
      })
    )

    await clearPlatformAuthSessions(['netease', 'qq', 'kugou', 'kugou', ''])

    expect(userStore.isLoggedIn).toBe(false)
    expect(userStore.qqCookie).toBe('')
    expect(userStore.platformAuthList.every(state => state.status === 'anonymous')).toBe(true)
    expect(pluginLogoutMock).toHaveBeenCalledTimes(3)
    expect(pluginLogoutMock).toHaveBeenCalledWith('netease')
    expect(pluginLogoutMock).toHaveBeenCalledWith('qq')
    expect(pluginLogoutMock).toHaveBeenCalledWith('kugou')
  })
})
