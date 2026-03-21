import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const platformServiceMock = vi.hoisted(() => ({
  isElectron: vi.fn(() => false)
}))

vi.mock('../../src/services', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/services')>()
  return {
    ...actual,
    services: {
      ...actual.services,
      platform: () => platformServiceMock
    }
  }
})

describe('SettingsPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows cache manager section when running in Electron', async () => {
    platformServiceMock.isElectron.mockReturnValue(true)
    const { default: SettingsPanel } = await import('../../src/components/SettingsPanel.vue')

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
    const { default: SettingsPanel } = await import('../../src/components/SettingsPanel.vue')

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
})
