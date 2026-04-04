import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import LikedSongsView from '../../../src/components/user/LikedSongsView.vue'
import type { FormattedSong } from '../../../src/utils/songFormatter'

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

describe('LikedSongsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('virtualizes large liked song lists instead of rendering every row at once', async () => {
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

    // Trigger ResizeObserver callback via a ResizeObserver mock
    global.ResizeObserver = class {
      observe: (target: Element) => void
      disconnect: () => void
      unobserve: (target: Element) => void
      constructor(callback: (entries: ResizeObserverEntry[]) => void) {
        this.observe = () => {
          callback([
            {
              contentRect: { width: 800, height: 400 } as DOMRectReadOnly,
              target: listElement
            } as ResizeObserverEntry
          ])
        }
        this.disconnect = vi.fn()
        this.unobserve = vi.fn()
      }
    } as unknown as typeof ResizeObserver

    await nextTick()
    await nextTick()

    const items = wrapper.findAll('.song-item')

    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(200)

    wrapper.unmount()
  })
})
