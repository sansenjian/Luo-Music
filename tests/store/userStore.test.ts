import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/utils/http', () => ({
  AUTH_REQUEST_CACHE_NAMESPACE: 'auth',
  clearCookieCache: vi.fn(),
  clearCacheNamespaces: vi.fn()
}))

vi.mock('../../src/api/qqmusic', () => ({
  clearQQCookieCache: vi.fn()
}))

import { clearQQCookieCache } from '../../src/api/qqmusic'
import { useUserStore } from '../../src/store/userStore'
import type { UserInfo } from '../../src/store/userStore'
import { clearCacheNamespaces, clearCookieCache } from '../../src/utils/http'

describe('userStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with separate Netease and QQ sessions', () => {
    const store = useUserStore()

    expect(store.userInfo).toBe(null)
    expect(store.cookie).toBe('')
    expect(store.isLoggedIn).toBe(false)
    expect(store.qqCookie).toBe('')
    expect(store.qqLoggedIn).toBe(false)
    expect(store.isQQMusicLoggedIn).toBe(false)
  })

  it('setUserInfo does not mark Netease as logged in without a cookie', () => {
    const store = useUserStore()
    const userInfo: UserInfo = { nickname: 'Test User', userId: 123 }

    store.setUserInfo(userInfo)

    expect(store.userInfo).toEqual(userInfo)
    expect(store.isLoggedIn).toBe(false)
  })

  it('setCookie updates Netease session state and clears request cache', () => {
    const store = useUserStore()

    store.setCookie('test-cookie')
    expect(store.cookie).toBe('test-cookie')
    expect(store.isLoggedIn).toBe(false)

    store.setUserInfo({ nickname: 'Test User' })
    expect(store.isLoggedIn).toBe(true)
    expect(clearCookieCache).toHaveBeenCalled()
    expect(clearCacheNamespaces).toHaveBeenCalledWith(['auth'])
  })

  it('login updates Netease profile and cookie together', () => {
    const store = useUserStore()
    const userInfo: UserInfo = { nickname: 'Test User', userId: 123 }

    store.login(userInfo, 'test-cookie')

    expect(store.userInfo).toEqual(userInfo)
    expect(store.cookie).toBe('test-cookie')
    expect(store.isLoggedIn).toBe(true)
    expect(clearCookieCache).toHaveBeenCalled()
    expect(clearCacheNamespaces).toHaveBeenCalledWith(['auth'])
  })

  it('logout clears only the Netease session', () => {
    const store = useUserStore()

    store.login({ nickname: 'User' }, 'netease-cookie')
    store.setQQCookie('qq-cookie')
    store.logout()

    expect(store.userInfo).toBe(null)
    expect(store.cookie).toBe('')
    expect(store.isLoggedIn).toBe(false)
    expect(store.qqCookie).toBe('qq-cookie')
    expect(store.qqLoggedIn).toBe(true)
    expect(clearCookieCache).toHaveBeenCalled()
    expect(clearCacheNamespaces).toHaveBeenCalledWith(['auth'])
  })

  it('setQQCookie updates only the QQ session', () => {
    const store = useUserStore()

    store.setQQCookie('qq-cookie')

    expect(store.qqCookie).toBe('qq-cookie')
    expect(store.qqLoggedIn).toBe(true)
    expect(store.isQQMusicLoggedIn).toBe(true)
    expect(store.cookie).toBe('')
    expect(clearQQCookieCache).toHaveBeenCalled()
    expect(clearCacheNamespaces).toHaveBeenCalledWith(['auth'])
  })

  it('logoutQQ clears only the QQ session', () => {
    const store = useUserStore()

    store.login({ nickname: 'User' }, 'netease-cookie')
    store.setQQCookie('qq-cookie')
    store.logoutQQ()

    expect(store.cookie).toBe('netease-cookie')
    expect(store.isLoggedIn).toBe(true)
    expect(store.qqCookie).toBe('')
    expect(store.qqLoggedIn).toBe(false)
    expect(clearQQCookieCache).toHaveBeenCalled()
    expect(clearCacheNamespaces).toHaveBeenCalledWith(['auth'])
  })

  describe('getters', () => {
    it('exposes profile fields from userInfo', () => {
      const store = useUserStore()

      expect(store.nickname).toBe('')
      expect(store.avatarUrl).toBe('')
      expect(store.userId).toBe(null)

      store.setUserInfo({
        nickname: 'Test User',
        avatarUrl: 'http://example.com/avatar.jpg',
        userId: 12345
      })

      expect(store.nickname).toBe('Test User')
      expect(store.avatarUrl).toBe('http://example.com/avatar.jpg')
      expect(store.userId).toBe(12345)
    })
  })
})
