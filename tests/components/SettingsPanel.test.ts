import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => false)
}))

const storageServiceMock = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => string | null>(() => null),
  setItem: vi.fn()
}))

vi.mock('@/services', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock,
      storage: () => storageServiceMock
    }
  }
})

describe('SettingsPanel.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageServiceMock.getItem.mockReturnValue(null)
  })

  it('shows cache manager section when running in Electron', async () => {
    platformServiceMock.isElectron.mockReturnValue(true)
    const { default: SettingsPanel } = await import('@/components/SettingsPanel.vue')

    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: false,
          CacheManager: {
            template: '<div class="cache-manager-stub">cache manager</div>'
          }
        }
      }
    })

    await wrapper.find('.settings-btn').trigger('click')

    expect(document.body.querySelector('.cache-manager-stub')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows fallback message outside Electron', async () => {
    platformServiceMock.isElectron.mockReturnValue(false)
    const { default: SettingsPanel } = await import('@/components/SettingsPanel.vue')

    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: false,
          CacheManager: true
        }
      }
    })

    await wrapper.find('.settings-btn').trigger('click')

    expect(document.body.querySelector('.cache-unavailable')).not.toBeNull()
    wrapper.unmount()
  })

  it('persists the selected home brand placement', async () => {
    const { default: SettingsPanel } = await import('@/components/SettingsPanel.vue')

    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: false,
          CacheManager: true
        }
      }
    })

    await wrapper.find('.settings-btn').trigger('click')

    const brandPlacementGroup = document.body.querySelector('[aria-label="品牌标识位置"]')
    const options = Array.from(brandPlacementGroup?.querySelectorAll('.placement-option') ?? [])
    expect(options.map(option => option.textContent?.trim())).toEqual(['顶栏', '侧边栏'])

    const headerOption = options.find(option => option.textContent?.includes('顶栏')) as
      | HTMLButtonElement
      | undefined
    expect(headerOption).toBeDefined()

    headerOption?.click()
    await wrapper.vm.$nextTick()

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('homeBrandPlacement', 'header')
    expect(headerOption?.classList.contains('active')).toBe(true)

    wrapper.unmount()
  })

  it('persists the selected render style', async () => {
    const { default: SettingsPanel } = await import('@/components/SettingsPanel.vue')

    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: false,
          CacheManager: true
        }
      }
    })

    await wrapper.find('.settings-btn').trigger('click')

    const options = Array.from(document.body.querySelectorAll('.placement-option'))
    expect(options.map(option => option.textContent?.trim())).toContain('经典风格')
    expect(options.map(option => option.textContent?.trim())).toContain('品牌风格')

    const brandOption = options.find(option => option.textContent?.includes('品牌风格')) as
      | HTMLButtonElement
      | undefined
    expect(brandOption).toBeDefined()

    brandOption?.click()
    await wrapper.vm.$nextTick()

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('renderStyle', 'brand')
    expect(document.documentElement.dataset.renderStyle).toBe('brand')

    wrapper.unmount()
  })

  it('persists the selected docked player bar layout', async () => {
    const { default: SettingsPanel } = await import('@/components/SettingsPanel.vue')

    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: false,
          Transition: false,
          CacheManager: true
        }
      }
    })

    await wrapper.find('.settings-btn').trigger('click')

    const footerLayoutGroup = document.body.querySelector('[aria-label="紧贴底栏播放器布局"]')
    const options = Array.from(footerLayoutGroup?.querySelectorAll('.placement-option') ?? [])
    expect(options.map(option => option.textContent?.trim())).toEqual(['铺满底栏', '给侧边栏留位'])

    const withSidebarOption = options.find(option =>
      option.textContent?.includes('给侧边栏留位')
    ) as HTMLButtonElement | undefined
    expect(withSidebarOption).toBeDefined()

    withSidebarOption?.click()
    await wrapper.vm.$nextTick()

    expect(storageServiceMock.setItem).toHaveBeenCalledWith('dockedPlayerBarLayout', 'with-sidebar')
    expect(withSidebarOption?.classList.contains('active')).toBe(true)

    wrapper.unmount()
  })
})
