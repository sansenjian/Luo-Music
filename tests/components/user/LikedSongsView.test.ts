import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import LikedSongsView from '@/components/user/LikedSongsView.vue'
import type { FormattedSong } from '@/utils/songFormatter'

function createSong(index: number): FormattedSong {
  return {
    index,
    id: index + 1,
    name: `Song ${index + 1}`,
    artist: `Artist ${index + 1}`,
    album: `Album ${index + 1}`,
    cover: `cover-${index + 1}.jpg`,
    duration: 180 + index
  }
}

function installResizeObserverMock() {
  let callback: ((entries: ResizeObserverEntry[]) => void) | null = null
  const observe = vi.fn()
  const disconnect = vi.fn()

  global.ResizeObserver = class {
    observe = observe
    disconnect = disconnect
    unobserve = vi.fn()

    constructor(nextCallback: (entries: ResizeObserverEntry[]) => void) {
      callback = nextCallback
    }
  } as unknown as typeof ResizeObserver

  return {
    observe,
    disconnect,
    trigger(target: Element) {
      callback?.([
        {
          contentRect: {
            width: 800,
            height: (target as HTMLElement).clientHeight || 400
          } as DOMRectReadOnly,
          target
        } as ResizeObserverEntry
      ])
    }
  }
}

describe('LikedSongsView', () => {
  let originalResizeObserver: typeof global.ResizeObserver

  beforeEach(() => {
    vi.clearAllMocks()
    originalResizeObserver = global.ResizeObserver
  })

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
    document.body.innerHTML = ''
  })

  it('renders empty state when there are no liked songs', () => {
    const wrapper = mount(LikedSongsView, {
      props: {
        likeSongs: []
      }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无喜欢的音乐')
    wrapper.unmount()
  })

  it('emits play-all and play-song actions', async () => {
    const wrapper = mount(LikedSongsView, {
      props: {
        likeSongs: [createSong(0), createSong(1)]
      }
    })

    await wrapper.find('.play-all-btn').trigger('click')
    await wrapper.findAll('.song-item')[1].trigger('click')

    expect(wrapper.emitted('play-all')).toHaveLength(1)
    expect(wrapper.emitted('play-song')?.[0]).toEqual([1])
  })

  it('filters loaded songs and preserves the original play index', async () => {
    const wrapper = mount(LikedSongsView, {
      props: {
        likeSongs: [createSong(0), createSong(1), createSong(2)]
      }
    })

    await wrapper.get('input[type="search"]').setValue('Artist 3')

    const items = wrapper.findAll('.song-item')
    expect(items).toHaveLength(1)
    expect(wrapper.find('.results-summary').text()).toContain('找到 1 首匹配歌曲')

    await items[0].trigger('click')

    expect(wrapper.emitted('play-song')?.[0]).toEqual([2])
  })

  it('renders an error state and emits retry when liked songs fail to load', async () => {
    const wrapper = mount(LikedSongsView, {
      props: {
        likeSongs: [],
        error: new Error('request failed')
      }
    })

    expect(wrapper.find('.error-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('喜欢的音乐加载失败')

    await wrapper.get('.retry-btn').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('virtualizes large liked song lists instead of rendering every row at once', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: Array.from({ length: 200 }, (_, index) => createSong(index))
      }
    })

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    const items = wrapper.findAll('.song-item')

    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(200)

    wrapper.unmount()
  })

  it('supports keyboard focus movement across visible songs', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: Array.from({ length: 40 }, (_, index) => createSong(index))
      }
    })

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 352
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    expect(wrapper.get('.song-item[data-filtered-index="0"]').attributes('tabindex')).toBe('0')

    await wrapper.get('.songs-list').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    await nextTick()

    const activeItem = wrapper.get('.song-item[data-filtered-index="1"]')
    expect(activeItem.attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(activeItem.element)

    wrapper.unmount()
  })

  it('emits load-more when scrolled near the end and more liked songs are available', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: Array.from({ length: 100 }, (_, index) => createSong(index)),
        hasMore: true
      }
    })

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    listElement.scrollTop = 8400
    await wrapper.get('.songs-list').trigger('scroll')

    expect(wrapper.emitted('load-more')).toHaveLength(1)

    wrapper.unmount()
  })

  it('allows another load-more request after more liked songs are appended', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: Array.from({ length: 100 }, (_, index) => createSong(index)),
        hasMore: true
      }
    })

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    listElement.scrollTop = 8400
    await wrapper.get('.songs-list').trigger('scroll')

    await wrapper.setProps({
      loadingMore: true
    })
    await nextTick()

    await wrapper.setProps({
      likeSongs: Array.from({ length: 200 }, (_, index) => createSong(index)),
      loadingMore: false
    })
    await nextTick()
    await nextTick()

    listElement.scrollTop = 17200
    await wrapper.get('.songs-list').trigger('scroll')

    expect(wrapper.emitted('load-more')).toHaveLength(2)

    wrapper.unmount()
  })

  it('preserves scroll position after appending songs and only resets on search changes', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: Array.from({ length: 120 }, (_, index) => createSong(index)),
        hasMore: true
      }
    })

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    listElement.scrollTop = 4400
    await wrapper.get('.songs-list').trigger('scroll')
    await nextTick()

    expect(wrapper.get('.song-item[data-filtered-index="50"]').attributes('tabindex')).toBe('0')

    await wrapper.setProps({
      likeSongs: Array.from({ length: 180 }, (_, index) => createSong(index))
    })
    await nextTick()
    await nextTick()

    expect(listElement.scrollTop).toBe(4400)
    expect(wrapper.get('.song-item[data-filtered-index="50"]').attributes('tabindex')).toBe('0')

    await wrapper.get('input[type="search"]').setValue('Song 1')
    await nextTick()
    await nextTick()

    expect(listElement.scrollTop).toBe(0)
    expect(wrapper.get('.song-item[data-filtered-index="0"]').attributes('tabindex')).toBe('0')

    wrapper.unmount()
  })

  it('rebinds ResizeObserver when the list element appears after mount', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(LikedSongsView, {
      attachTo: document.body,
      props: {
        likeSongs: [],
        loading: true
      }
    })

    expect(wrapper.find('.songs-list').exists()).toBe(false)
    expect(resizeObserverMock.observe).not.toHaveBeenCalled()

    await wrapper.setProps({
      likeSongs: Array.from({ length: 20 }, (_, index) => createSong(index)),
      loading: false
    })
    await nextTick()

    const listElement = wrapper.get('.songs-list').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    expect(resizeObserverMock.observe).toHaveBeenCalledWith(listElement)
    expect(wrapper.findAll('.song-item').length).toBeGreaterThan(0)

    wrapper.unmount()
  })
})
