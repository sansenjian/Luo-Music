import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { nextTick } from 'vue'

import SongDetailList from '@/components/media/SongDetailList.vue'
import { createMockSong } from '../../utils/test-utils'

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

describe('SongDetailList', () => {
  let originalResizeObserver: typeof global.ResizeObserver

  beforeEach(() => {
    vi.clearAllMocks()
    originalResizeObserver = global.ResizeObserver
  })

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
    document.body.innerHTML = ''
  })

  it('uses the fallback cover when the song album cover is missing', () => {
    const wrapper = mount(SongDetailList, {
      props: {
        fallbackCover: 'album-cover.jpg',
        songs: [
          createMockSong({
            id: 'song-1',
            name: 'Song 1',
            album: {
              id: 'album-1',
              name: 'Album 1',
              picUrl: ''
            }
          })
        ]
      }
    })

    const cover = wrapper.get('img.detail-song-cover')
    expect(cover.attributes('src')).toBe('album-cover.jpg')
  })

  it('renders incomplete song objects without requiring album metadata', () => {
    expect(() =>
      mount(SongDetailList, {
        props: {
          songs: [
            {
              id: 'song-1',
              name: 'Song 1',
              artists: [{ id: 'artist-1', name: 'Artist 1' }],
              duration: 180000,
              mvid: 0,
              platform: 'netease',
              originalId: 'song-1'
            } as any
          ]
        }
      })
    ).not.toThrow()
  })

  it('virtualizes large song lists instead of rendering every detail row at once', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const wrapper = mount(SongDetailList, {
      attachTo: document.body,
      props: {
        songs: Array.from({ length: 200 }, (_, index) =>
          createMockSong({
            id: `song-${index + 1}`,
            name: `Song ${index + 1}`
          })
        )
      }
    })

    const listElement = wrapper.get('.detail-list-virtualized').element as HTMLElement
    Object.defineProperty(listElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    resizeObserverMock.trigger(listElement)
    await nextTick()
    await nextTick()

    const items = wrapper.findAll('.detail-song')

    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(200)

    wrapper.unmount()
  })

  it('renders a static list when virtualization is explicitly disabled', () => {
    const wrapper = mount(SongDetailList, {
      props: {
        disableVirtualization: true,
        songs: Array.from({ length: 200 }, (_, index) =>
          createMockSong({
            id: `song-${index + 1}`,
            name: `Song ${index + 1}`
          })
        )
      }
    })

    expect(wrapper.find('.detail-list-virtualized').exists()).toBe(false)
    expect(wrapper.find('.detail-list-static').exists()).toBe(true)
    expect(wrapper.findAll('.detail-song')).toHaveLength(200)
  })

  it('emits context menu details for the selected row', async () => {
    const song = createMockSong({
      id: 'local:track-1',
      name: 'Local Song',
      originalId: 'local:track-1',
      platform: 'local',
      extra: {
        localSource: true
      }
    })
    const wrapper = mount(SongDetailList, {
      props: {
        disableVirtualization: true,
        songs: [song]
      }
    })

    await wrapper.get('.detail-song').trigger('contextmenu', {
      clientX: 42,
      clientY: 64
    })

    expect(wrapper.emitted('song-context-menu')?.[0]).toEqual([
      {
        clientX: 42,
        clientY: 64,
        index: 0,
        song
      }
    ])
  })

  it('progressively renders more songs when the outer scroll container advances', async () => {
    const resizeObserverMock = installResizeObserverMock()
    const scrollContainer = document.createElement('div')
    scrollContainer.style.overflowY = 'auto'
    document.body.appendChild(scrollContainer)

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 400
    })
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0
    })

    const wrapper = mount(SongDetailList, {
      attachTo: scrollContainer,
      props: {
        progressiveRender: true,
        songs: Array.from({ length: 120 }, (_, index) =>
          createMockSong({
            id: `song-${index + 1}`,
            name: `Song ${index + 1}`
          })
        )
      }
    })

    const rootElement = wrapper.get('.song-detail-list').element as HTMLElement
    Object.defineProperty(rootElement, 'clientHeight', {
      configurable: true,
      value: 400
    })

    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(rootElement, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          x: 0,
          y: -scrollContainer.scrollTop,
          top: -scrollContainer.scrollTop,
          left: 0,
          right: 400,
          bottom: 400 - scrollContainer.scrollTop,
          width: 400,
          height: 400,
          toJSON: () => ({})
        }) as DOMRect
    )

    resizeObserverMock.trigger(scrollContainer)
    await nextTick()
    await nextTick()

    expect(wrapper.find('.detail-list-virtualized').exists()).toBe(false)
    expect(wrapper.findAll('.detail-song')).toHaveLength(50)

    scrollContainer.scrollTop = 2500
    scrollContainer.dispatchEvent(new Event('scroll'))
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('.detail-song')).toHaveLength(100)
  })
})
