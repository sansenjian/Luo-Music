import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HomeSidebar from '@/components/home/HomeSidebar.vue'

describe('HomeSidebar', () => {
  it('renders the sidebar shell sections and playlist placeholder', () => {
    const wrapper = mount(HomeSidebar)

    expect(wrapper.text()).toContain('LUO Music')
    expect(wrapper.text()).toContain('推荐')
    expect(wrapper.text()).toContain('我的')
    expect(wrapper.text()).toContain('创建的歌单 1')
    expect(wrapper.text()).toContain('sansenjian 的本地音乐歌单')
  })

  it('switches the active item when a sidebar link is clicked', async () => {
    const wrapper = mount(HomeSidebar)
    const links = wrapper.findAll('.sidebar-link')

    expect(links[0].classes()).toContain('active')

    const localMusicLink = links.find(link => link.text().includes('本地音乐'))
    expect(localMusicLink).toBeDefined()

    await localMusicLink?.trigger('click')

    expect(localMusicLink?.classes()).toContain('active')
    expect(links[0].classes()).not.toContain('active')
  })

  it('hides the sidebar brand block when showBrand is false', () => {
    const wrapper = mount(HomeSidebar, {
      props: {
        showBrand: false
      }
    })

    expect(wrapper.text()).not.toContain('LUO Music')
    expect(wrapper.find('.sidebar-brand').exists()).toBe(false)
  })

  it('shows only icons when collapsed is true', () => {
    const wrapper = mount(HomeSidebar, {
      props: {
        collapsed: true
      }
    })

    expect(wrapper.classes()).toContain('is-collapsed')
    expect(wrapper.text()).not.toContain('推荐')
    expect(wrapper.text()).not.toContain('LUO Music')
    expect(wrapper.find('.sidebar-icon').exists()).toBe(true)
    expect(wrapper.find('.playlist-art').exists()).toBe(true)
  })
})
