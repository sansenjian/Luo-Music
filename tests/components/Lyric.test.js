import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import Lyric from '../../src/components/Lyric.vue'

// Mock anime.js
vi.mock('animejs', () => ({
  default: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn()
  })),
  animate: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn()
  }))
}))

describe('Lyric Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该正确渲染组件', () => {
    const wrapper = mount(Lyric)
    expect(wrapper.exists()).toBe(true)
  })

  it('应该渲染歌词列表', () => {
    const wrapper = mount(Lyric)
    const store = wrapper.vm.playerStore

    store.lyricsArray = [
      { time: 0, lyric: '第一行歌词' },
      { time: 5, lyric: '第二行歌词' },
      { time: 10, lyric: '第三行歌词' }
    ]

    return wrapper.vm.$nextTick().then(() => {
      const lines = wrapper.findAll('.lyric-line')
      expect(lines).toHaveLength(3)
    })
  })

  it('应该高亮当前歌词行', () => {
    const wrapper = mount(Lyric)
    const store = wrapper.vm.playerStore

    store.lyricsArray = [
      { time: 0, lyric: '第一行' },
      { time: 5, lyric: '第二行' },
      { time: 10, lyric: '第三行' }
    ]
    store.currentLyricIndex = 1

    return wrapper.vm.$nextTick().then(() => {
      const lines = wrapper.findAll('.lyric-line')
      expect(lines[1].classes()).toContain('active')
    })
  })

  it('应该显示翻译歌词', () => {
    const wrapper = mount(Lyric)
    const store = wrapper.vm.playerStore

    store.lyricsArray = [
      { time: 0, lyric: '原文', tlyric: 'Translation' },
      { time: 5, lyric: '原文2', tlyric: 'Translation 2' }
    ]

    return wrapper.vm.$nextTick().then(() => {
      const lines = wrapper.findAll('.lyric-line')
      expect(lines[0].text()).toContain('Translation')
    })
  })

  it('应该能访问 playerStore', () => {
    const wrapper = mount(Lyric)
    const store = wrapper.vm.playerStore
    expect(store).toBeDefined()
  })
})
