import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import SongDetailList from '@/components/user/SongDetailList.vue'
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
})
