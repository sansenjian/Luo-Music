import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeFooter from '@/components/home/HomeFooter.vue'

describe('HomeFooter', () => {
  it('renders the status bar when the player is not docked', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isPlayerDocked: false,
        isLoading: true,
        trackCount: 12
      }
    })

    expect(wrapper.find('.statusbar').exists()).toBe(true)
    expect(wrapper.text()).toContain('12 Tracks')
    expect(wrapper.text()).toContain('Loading...')
  })

  it('renders the docked player bar full width by default', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isPlayerDocked: true,
        isLoading: false,
        trackCount: 3
      },
      slots: {
        'docked-player': '<div class="docked-player-slot">docked player</div>'
      }
    })

    expect(wrapper.find('.docked-player-bar').classes()).toContain('layout-full')
    expect(wrapper.find('.docked-player-bar-body').text()).toContain('docked player')
  })

  it('keeps the docked player bar body intact when the adaptive sidebar layout is enabled', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isPlayerDocked: true,
        isLoading: false,
        trackCount: 3,
        dockedPlayerBarLayout: 'with-sidebar'
      },
      slots: {
        'docked-player': '<div class="docked-player-slot">docked player</div>'
      }
    })

    expect(wrapper.find('.docked-player-bar').classes()).toContain('layout-with-sidebar')
    expect(wrapper.find('.docked-player-bar-body').text()).toContain('docked player')
  })
})
