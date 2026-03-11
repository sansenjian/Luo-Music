import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import UserProfileHeader from '../../../src/components/user/UserProfileHeader.vue'

// Mock data
interface MockProfile {
  nickname: string
  avatarUrl: string
  backgroundUrl: string
  signature: string
  vipType: number
  follows: number
  followeds: number
}

interface MockStats {
  playlists: number
  follows: number
  followeds: number
  level: number
  isVip: boolean
}

const mockProfile: MockProfile = {
  nickname: 'Test User',
  avatarUrl: 'http://example.com/avatar.jpg',
  backgroundUrl: 'http://example.com/bg.jpg',
  signature: 'Test Signature',
  vipType: 1,
  follows: 10,
  followeds: 20
}

const mockStats: MockStats = {
  playlists: 5,
  follows: 10,
  followeds: 20,
  level: 8,
  isVip: true
}

// Mock useUserDataQuery
const mockUseUserDataQuery = vi.fn()

vi.mock('../../../src/composables/useUserDataQuery', () => ({
  useUserDataQuery: (source: () => string) => {
    mockUseUserDataQuery(source)
    return {
      profile: mockProfile,
      stats: mockStats,
      userDetail: {},
      loading: false,
      error: null
    }
  }
}))

describe('UserProfileHeader.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user info correctly', () => {
    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123'
      }
    })
    
    expect(wrapper.find('.user-nickname').text()).toBe('Test User')
    expect(wrapper.find('.user-signature').text()).toBe('Test Signature')
    expect(wrapper.find('.user-level').text()).toBe('Lv.8')
    
    // Check stats
    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('5') // playlists
    expect(statValues[1].text()).toBe('10') // follows
    expect(statValues[2].text()).toBe('20') // followeds
  })

  it('initializes useUserDataQuery with correct source', () => {
    mount(UserProfileHeader, {
      props: {
        userId: '123'
      }
    })
    
    expect(mockUseUserDataQuery).toHaveBeenCalled()
    // 验证传入的是一个函数
    const sourceArg = mockUseUserDataQuery.mock.calls[0][0] as () => string
    expect(typeof sourceArg).toBe('function')
    expect(sourceArg()).toBe('123')
  })

  it('updates source value when prop changes', async () => {
    const wrapper = mount(UserProfileHeader, {
      props: {
        userId: '123'
      }
    })
    
    const sourceArg = mockUseUserDataQuery.mock.calls[0][0] as () => string
    expect(sourceArg()).toBe('123')
    
    await wrapper.setProps({ userId: '456' })
    
    // useUserDataQuery 只会在 setup 时调用一次，但它的参数（getter）应该返回新值
    expect(sourceArg()).toBe('456')
  })
})
