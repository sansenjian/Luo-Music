import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import UserProfile from '../../src/components/UserProfile.vue'
import { useUserStore } from '../../src/store/userStore'

// Mock the API module
vi.mock('../../src/api/user', () => ({
  logout: vi.fn(() => Promise.resolve())
}))

// Import the mocked function to assert calls
import { logout } from '../../src/api/user'

interface UserInfo {
  nickname?: string
  avatarUrl?: string
  userId?: string
}

describe('UserProfile.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders user info correctly when logged in', () => {
    const store = useUserStore()
    store.setUserInfo({
      nickname: 'Test User',
      avatarUrl: 'http://example.com/avatar.jpg',
      userId: '12345'
    })

    const wrapper = mount(UserProfile)
    
    expect(wrapper.find('.user-nickname').text()).toBe('Test User')
    expect(wrapper.find('.user-id').text()).toContain('12345')
    expect(wrapper.find('img.user-avatar').exists()).toBe(true)
    expect(wrapper.find('img.user-avatar').attributes('src')).toBe('http://example.com/avatar.jpg')
  })

  it('renders placeholder when no avatar', () => {
    const store = useUserStore()
    store.setUserInfo({
      nickname: 'Test User',
      userId: '12345'
      // No avatarUrl
    })

    const wrapper = mount(UserProfile)
    
    expect(wrapper.find('.user-avatar-placeholder').exists()).toBe(true)
    expect(wrapper.find('img.user-avatar').exists()).toBe(false)
  })

  it('renders default text when no user info', () => {
    // No user info set
    const wrapper = mount(UserProfile)
    
    expect(wrapper.find('.user-nickname').text()).toBe('未知用户')
    expect(wrapper.find('.user-id').text()).toContain('-')
  })

  it('handles logout correctly', async () => {
    const store = useUserStore()
    store.setUserInfo({
      nickname: 'Test User',
      userId: '12345'
    })
    
    // Spy on store logout action
    const storeLogoutSpy = vi.spyOn(store, 'logout')
    
    const wrapper = mount(UserProfile)
    
    await wrapper.find('.logout-btn').trigger('click')
    
    expect(logout).toHaveBeenCalled()
    expect(storeLogoutSpy).toHaveBeenCalled()
  })

  it('handles logout error gracefully', async () => {
    // Mock logout failure
    vi.mocked(logout).mockRejectedValueOnce(new Error('Logout failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    const store = useUserStore()
    const storeLogoutSpy = vi.spyOn(store, 'logout')
    
    const wrapper = mount(UserProfile)
    
    await wrapper.find('.logout-btn').trigger('click')
    
    // API called
    expect(logout).toHaveBeenCalled()
    // Error logged
    expect(consoleSpy).toHaveBeenCalledWith('退出登录失败:', expect.any(Error))
    // Store logout should still be called (in finally block)
    expect(storeLogoutSpy).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })
})
