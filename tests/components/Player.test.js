import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import Player from '../../src/components/Player.vue'

// Mock anime.js
vi.mock('animejs', () => ({
  default: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn()
  }))
}))

// Mock composables
vi.mock('../../src/composables/useAnimations.js', () => ({
  animate: vi.fn(),
  animateButtonClick: vi.fn(),
  animatePlayPause: vi.fn(),
  animateAlbumCover: vi.fn(),
  animateLoopMode: vi.fn()
}))

describe('Player Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该正确渲染组件', () => {
    const wrapper = mount(Player, {
      props: {
        compact: false,
        loading: false
      }
    })
    
    expect(wrapper.exists()).toBe(true)
    // 组件渲染成功即可
  })

  it('应该在 compact 模式下渲染', () => {
    const wrapper = mount(Player, {
      props: {
        compact: true,
        loading: false
      }
    })
    
    expect(wrapper.exists()).toBe(true)
  })

  it('应该显示播放控制按钮', () => {
    const wrapper = mount(Player, {
      props: {
        compact: false,
        loading: false
      }
    })
    
    // 检查是否有按钮元素
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('应该响应 props 变化', async () => {
    const wrapper = mount(Player, {
      props: {
        compact: false,
        loading: false
      }
    })
    
    expect(wrapper.props('compact')).toBe(false)
    expect(wrapper.props('loading')).toBe(false)
    
    await wrapper.setProps({ compact: true, loading: true })
    
    expect(wrapper.props('compact')).toBe(true)
    expect(wrapper.props('loading')).toBe(true)
  })

  it('应该能访问 playerStore', () => {
    const wrapper = mount(Player, {
      props: {
        compact: false,
        loading: false
      }
    })
    
    const store = wrapper.vm.playerStore
    expect(store).toBeDefined()
    expect(store.playing).toBe(false)
  })
})
