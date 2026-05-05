import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'

import HomeMediaPanelShell from '@/components/home/media/HomeMediaPanelShell.vue'

describe('HomeMediaPanelShell', () => {
  it('renders the default empty state when the shell is empty', () => {
    const wrapper = mount(HomeMediaPanelShell, {
      props: {
        empty: true,
        emptyTitle: '空状态标题',
        emptyDescription: '请选择一个歌单或收藏专辑。'
      }
    })

    expect(wrapper.text()).toContain('空状态标题')
    expect(wrapper.text()).toContain('请选择一个歌单或收藏专辑。')
  })

  it('renders a custom empty slot when provided', () => {
    const wrapper = mount(HomeMediaPanelShell, {
      props: {
        empty: true,
        emptyDescription: 'fallback'
      },
      slots: {
        empty: '<div class="custom-empty">自定义空态</div>'
      }
    })

    expect(wrapper.find('.custom-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('自定义空态')
    expect(wrapper.text()).not.toContain('fallback')
  })

  it('renders hero, toolbar, and content slots in the shared layout shell', () => {
    const wrapper = mount(HomeMediaPanelShell, {
      slots: {
        hero: '<div class="hero-slot">hero</div>',
        toolbar: '<div class="toolbar-slot">toolbar</div>',
        default: '<div class="content-slot">content</div>'
      }
    })

    expect(wrapper.find('.hero-slot').exists()).toBe(true)
    expect(wrapper.find('.toolbar-slot').exists()).toBe(true)
    expect(wrapper.find('.content-slot').exists()).toBe(true)
  })
})
