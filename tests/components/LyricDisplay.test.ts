import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import LyricDisplay from '../../src/components/LyricDisplay.vue'
import { usePlayerStore } from '../../src/store/playerStore'

describe('LyricDisplay', () => {
  let resizeObserverCallback:
    | ((entries: Array<{ contentRect: { height: number } }>) => void)
    | null = null
  let scrollToMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    scrollToMock = vi.fn()

    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock
    })

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: Array<{ contentRect: { height: number } }>) => void) {
          resizeObserverCallback = callback
        }

        observe(): void {}
        disconnect(): void {}
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resizeObserverCallback = null
  })

  it('scrolls the active lyric into view when the lyric index changes', async () => {
    const store = usePlayerStore()
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])

    const wrapper = mount(LyricDisplay)
    await nextTick()

    const scrollArea = wrapper.find('.lyrics-wrapper').element as HTMLElement
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 200
    })
    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      value: 800
    })

    const lyricLines = wrapper.findAll('.lyric-line')
    Object.defineProperty(lyricLines[1].element, 'offsetTop', {
      configurable: true,
      value: 260
    })
    Object.defineProperty(lyricLines[1].element, 'offsetHeight', {
      configurable: true,
      value: 40
    })

    store.currentLyricIndex = 1
    await nextTick()
    await nextTick()

    expect(scrollArea.scrollTo).toHaveBeenCalledWith({
      top: 180,
      behavior: 'auto'
    })
  })

  it('re-centers the active lyric when the lyrics panel becomes visible', async () => {
    const store = usePlayerStore()
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])
    store.currentLyricIndex = 1

    const wrapper = mount(LyricDisplay)
    await nextTick()

    const scrollArea = wrapper.find('.lyrics-wrapper').element as HTMLElement
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 0,
      writable: true
    })
    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      value: 800
    })

    const lyricLines = wrapper.findAll('.lyric-line')
    Object.defineProperty(lyricLines[1].element, 'offsetTop', {
      configurable: true,
      value: 260
    })
    Object.defineProperty(lyricLines[1].element, 'offsetHeight', {
      configurable: true,
      value: 40
    })

    scrollToMock.mockClear()
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 200
    })

    resizeObserverCallback?.([{ contentRect: { height: 200 } }])
    await nextTick()
    await nextTick()

    expect(scrollArea.scrollTo).toHaveBeenCalledWith({
      top: 180,
      behavior: 'auto'
    })
  })

  it('re-centers the active lyric when the active prop changes to true', async () => {
    const store = usePlayerStore()
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])
    store.currentLyricIndex = 1

    const wrapper = mount(LyricDisplay, {
      props: {
        active: false
      }
    })
    await nextTick()

    const scrollArea = wrapper.find('.lyrics-wrapper').element as HTMLElement
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 200
    })
    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      value: 800
    })

    const lyricLines = wrapper.findAll('.lyric-line')
    Object.defineProperty(lyricLines[1].element, 'offsetTop', {
      configurable: true,
      value: 260
    })
    Object.defineProperty(lyricLines[1].element, 'offsetHeight', {
      configurable: true,
      value: 40
    })

    scrollToMock.mockClear()
    await wrapper.setProps({ active: true })
    await nextTick()
    await nextTick()

    expect(scrollArea.scrollTo).toHaveBeenCalledWith({
      top: 180,
      behavior: 'auto'
    })
  })
})
