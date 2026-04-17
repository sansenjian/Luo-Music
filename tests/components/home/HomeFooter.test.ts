import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeFooter from '@/components/home/HomeFooter.vue'

describe('HomeFooter', () => {
  it('renders the status bar in non-compact mode', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isCompact: false,
        isLoading: true,
        trackCount: 12
      }
    })

    expect(wrapper.find('.statusbar').exists()).toBe(true)
    expect(wrapper.text()).toContain('12 Tracks')
    expect(wrapper.text()).toContain('Loading...')
  })

  it('renders the compact player full width by default', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isCompact: true,
        isLoading: false,
        trackCount: 3
      },
      slots: {
        'compact-player': '<div class="compact-player-slot">compact player</div>'
      }
    })

    expect(wrapper.find('.compact-player').classes()).toContain('layout-full')
    expect(wrapper.find('.compact-sidebar-fill').exists()).toBe(false)
    expect(wrapper.find('.compact-player-body').text()).toContain('compact player')
  })

  it('reserves sidebar space when the compact footer layout is set to with-sidebar', () => {
    const wrapper = mount(HomeFooter, {
      props: {
        isCompact: true,
        isLoading: false,
        trackCount: 3,
        compactPlayerFooterLayout: 'with-sidebar'
      },
      slots: {
        'compact-sidebar-fill': '<div class="sidebar-fill-slot">sidebar footer</div>',
        'compact-player': '<div class="compact-player-slot">compact player</div>'
      }
    })

    expect(wrapper.find('.compact-player').classes()).toContain('layout-with-sidebar')
    expect(wrapper.find('.compact-sidebar-fill').exists()).toBe(true)
    expect(wrapper.find('.compact-sidebar-fill').text()).toContain('sidebar footer')
    expect(wrapper.find('.compact-player-body').text()).toContain('compact player')
  })
})
