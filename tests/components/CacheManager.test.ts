import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
