import { describe, expect, it } from 'vite-plus/test'
import { mount } from '@vue/test-utils'

import HomeHeader from '@/features/home/components/HomeHeader.vue'
import type { MusicServerOption } from '@/features/home/composables/useHomePage'

const servers: MusicServerOption[] = [
  { value: 'netease', label: 'Netease' },
  { value: 'qq', label: 'QQ Music' }
]

function createWrapper(isElectron = true) {
  return mount(HomeHeader, {
    props: {
      isElectron,
      isLoading: false,
      searchKeyword: '',
      selectedServer: 'netease',
      selectedServerLabel: 'Netease',
      servers,
      showSelect: true
    },
    global: {
      stubs: {
        UserAvatar: true
      }
    }
  })
}

describe('HomeHeader', () => {
  it('emits search-keyword-change when input changes', async () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input.cyber-input')

    await input.setValue('new keyword')

    const events = wrapper.emitted('search-keyword-change')
    expect(events?.[0]).toEqual(['new keyword'])
  })

  it('emits search on button click and Enter key', async () => {
    const wrapper = createWrapper()

    await wrapper.find('button.exec-btn').trigger('click')
    await wrapper.find('input.cyber-input').trigger('keyup.enter')

    const events = wrapper.emitted('search')
    expect(events).toHaveLength(2)
  })

  it('renders themeable search affordances', () => {
    const wrapper = createWrapper()

    expect(wrapper.find('.search-leading-icon').exists()).toBe(true)
    expect(wrapper.find('.search-shortcut').text()).toBe('Ctrl K')
  })

  it('emits server selection and dropdown toggle events', async () => {
    const wrapper = createWrapper()

    await wrapper.find('.server-select-custom').trigger('click')
    await wrapper.findAll('.dropdown-option')[1].trigger('click')

    expect(wrapper.emitted('toggle-select')).toHaveLength(1)
    expect(wrapper.emitted('select-server')?.[0]).toEqual(['qq'])
  })

  it('emits window control events only in electron mode', async () => {
    const wrapper = createWrapper(true)

    await wrapper.get('button[title="最小化"]').trigger('click')
    await wrapper.get('button[title="最大化"]').trigger('click')
    await wrapper.get('button[title="关闭"]').trigger('click')

    expect(wrapper.emitted('minimize-window')).toHaveLength(1)
    expect(wrapper.emitted('maximize-window')).toHaveLength(1)
    expect(wrapper.emitted('close-window')).toHaveLength(1)

    const webWrapper = createWrapper(false)
    expect(webWrapper.findAll('.win-btn')).toHaveLength(0)
  })

  it('emits workspace navigation events from title nav buttons', async () => {
    const wrapper = mount(HomeHeader, {
      props: {
        canNavigateBack: true,
        canNavigateForward: true,
        isElectron: false,
        isLoading: false,
        searchKeyword: '',
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: false
      }
    })

    await wrapper.get('button[aria-label="返回"]').trigger('click')
    await wrapper.get('button[aria-label="前进"]').trigger('click')

    expect(wrapper.emitted('navigate-back')).toHaveLength(1)
    expect(wrapper.emitted('navigate-forward')).toHaveLength(1)
  })

  it('disables title nav buttons when no workspace history is available', async () => {
    const wrapper = createWrapper(false)

    const backButton = wrapper.get('button[aria-label="返回"]')
    const forwardButton = wrapper.get('button[aria-label="前进"]')

    expect(backButton.attributes('disabled')).toBeDefined()
    expect(forwardButton.attributes('disabled')).toBeDefined()

    await backButton.trigger('click')
    await forwardButton.trigger('click')

    expect(wrapper.emitted('navigate-back')).toBeUndefined()
    expect(wrapper.emitted('navigate-forward')).toBeUndefined()
  })

  it('hides the brand badge when showBrand is false', () => {
    const wrapper = mount(HomeHeader, {
      props: {
        showBrand: false,
        isElectron: true,
        isLoading: false,
        searchKeyword: '',
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: true
      },
      global: {
        stubs: {
          UserAvatar: true
        }
      }
    })

    expect(wrapper.text()).not.toContain('LUO Music')
    expect(wrapper.find('.title-left').exists()).toBe(false)
  })
})
