import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  replaceRuntimePlatformDescriptors,
  resetRuntimePlatformDescriptors
} from '@/platform/music/descriptors'
import { useUserStore } from '@/store/userStore'

const platformServiceMock = vi.hoisted(() => ({
  clearCache: vi.fn(),
  getCacheSize: vi.fn(),
  isElectron: vi.fn(() => true)
}))

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock
    }
  }
})

describe('CacheManager.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRuntimePlatformDescriptors()
    platformServiceMock.isElectron.mockReturnValue(true)
    platformServiceMock.getCacheSize.mockResolvedValue({
      httpCache: 1024,
      httpCacheFormatted: '1 KB'
    })
  })

  it('loads cache size through platform service in Electron', async () => {
    const { default: CacheManager } = await import('@/components/CacheManager.vue')
    const wrapper = mount(CacheManager)

    await flushPromises()

    expect(platformServiceMock.isElectron).toHaveBeenCalled()
    expect(platformServiceMock.getCacheSize).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('1 KB')
  })

  it('does not load cache size outside Electron', async () => {
    platformServiceMock.isElectron.mockReturnValue(false)

    const { default: CacheManager } = await import('@/components/CacheManager.vue')
    const wrapper = mount(CacheManager)

    await flushPromises()

    expect(platformServiceMock.getCacheSize).not.toHaveBeenCalled()
    expect(wrapper.find('.cache-manager').exists()).toBe(false)
  })

  it('renders account cache status from common platform auth states', async () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'kugou',
        displayName: 'Kugou Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])
    const userStore = useUserStore()
    userStore.setPlatformAuthState({
      platform: 'kugou',
      status: 'authenticated',
      account: {
        id: 'plugin-user',
        nickname: 'Plugin User'
      }
    })

    const { default: CacheManager } = await import('@/components/CacheManager.vue')
    const wrapper = mount(CacheManager)

    await flushPromises()

    expect(wrapper.text()).toContain('Kugou Music 账号')
    expect(wrapper.text()).toContain('已登录')
  })
})
