import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '../../src/store/userStore'
import { clearCookieCache } from '../../src/utils/http'

// Mock dependencies
vi.mock('../../src/utils/http', () => ({
  clearCookieCache: vi.fn()
}))

describe('User Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const store = useUserStore()
    expect(store.userInfo).toBe(null)
    expect(store.cookie).toBe('')
    expect(store.isLoggedIn).toBe(false)
  })

  it('setUserInfo updates state correctly', () => {
    const store = useUserStore()
    const userInfo = { nickname: 'Test User', userId: 123 }
    
    store.setUserInfo(userInfo)
    
    expect(store.userInfo).toEqual(userInfo)
    expect(store.isLoggedIn).toBe(true)
  })

  it('setCookie updates cookie state', () => {
    const store = useUserStore()
    const cookie = 'test-cookie'
    
    store.setCookie(cookie)
    
    expect(store.cookie).toBe(cookie)
  })

  it('login updates both userInfo and cookie', () => {
    const store = useUserStore()
    const userInfo = { nickname: 'Test User', userId: 123 }
    const cookie = 'test-cookie'
    
    store.login(userInfo, cookie)
    
    expect(store.userInfo).toEqual(userInfo)
    expect(store.cookie).toBe(cookie)
    expect(store.isLoggedIn).toBe(true)
  })

  it('logout clears state and cache', () => {
    const store = useUserStore()
    // Setup initial logged in state
    store.login({ name: 'User' }, 'cookie')
    
    store.logout()
    
    expect(store.userInfo).toBe(null)
    expect(store.cookie).toBe('')
    expect(store.isLoggedIn).toBe(false)
    expect(clearCookieCache).toHaveBeenCalled()
  })

  describe('Getters', () => {
    it('nickname returns correct value', () => {
      const store = useUserStore()
      expect(store.nickname).toBe('')
      
      store.setUserInfo({ nickname: 'Test User' })
      expect(store.nickname).toBe('Test User')
    })

    it('avatarUrl returns correct value', () => {
      const store = useUserStore()
      expect(store.avatarUrl).toBe('')
      
      store.setUserInfo({ avatarUrl: 'http://example.com/avatar.jpg' })
      expect(store.avatarUrl).toBe('http://example.com/avatar.jpg')
    })

    it('userId returns correct value', () => {
      const store = useUserStore()
      expect(store.userId).toBe(null)
      
      store.setUserInfo({ userId: 12345 })
      expect(store.userId).toBe(12345)
    })
  })
})
