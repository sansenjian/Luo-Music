import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { nextTick } from 'vue'

import LyricDisplay from '@/components/LyricDisplay.vue'
import { usePlayerStore } from '@/store/playerStore'

describe('LyricDisplay', () => {
  let resizeObserverCallback:
    | ((entries: Array<{ contentRect: { height: number } }>) => void)
    | null = null
  let scrollToMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
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
    store.initAudio() // Initialize the LyricEngine
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

    // Update progress to trigger lyric index change through LyricEngine
    store.progress = 6
    store.updateLyricIndex(6)
    await nextTick()
    await nextTick()

    const activeLyricLine = wrapper.findAll('.lyric-line')[1]

    expect(store.currentLyricIndex).toBe(1)
    expect(activeLyricLine.classes()).toContain('active')
    expect(activeLyricLine.attributes('aria-current')).toBe('true')
    expect(scrollArea.scrollTo).toHaveBeenCalledWith({
      top: 180,
      behavior: 'smooth' // Uses smooth when index changes from a valid previous index
    })
  })

  it('re-centers the active lyric when the lyrics panel becomes visible', async () => {
    const store = usePlayerStore()
    store.initAudio() // Initialize the LyricEngine
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])
    store.progress = 6
    store.updateLyricIndex(6)

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

  it('falls back to progress-derived active lyric highlighting when the store index is stale', async () => {
    const store = usePlayerStore()
    store.initAudio()
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])
    store.progress = 6
    store.currentLyricIndex = -1

    const wrapper = mount(LyricDisplay)
    await nextTick()

    const lyricLines = wrapper.findAll('.lyric-line')
    expect(lyricLines[1].classes()).toContain('active')
    expect(lyricLines[1].attributes('aria-current')).toBe('true')
  })

  it('re-centers the active lyric when the active prop changes to true', async () => {
    const store = usePlayerStore()
    store.initAudio() // Initialize the LyricEngine
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: '', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' },
      { time: 10, text: 'Line 3', trans: '', roma: '' }
    ])
    store.progress = 6
    store.updateLyricIndex(6)

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

  it('falls back to original lyric text when configured visible lines would otherwise be empty', async () => {
    const store = usePlayerStore()
    store.initAudio() // Initialize the LyricEngine
    store.lyricType = ['trans']
    store.setLyricsArray([
      { time: 0, text: 'Line 1', trans: 'Translated 1', roma: '' },
      { time: 5, text: 'Line 2', trans: '', roma: '' }
    ])
    store.progress = 6
    store.updateLyricIndex(6)

    const wrapper = mount(LyricDisplay)
    await nextTick()

    const lyricLines = wrapper.findAll('.lyric-line')
    expect(lyricLines[1].classes()).toContain('active')
    expect(lyricLines[1].find('.lyric-main').text()).toBe('Line 2')
    expect(lyricLines[1].find('.lyric-trans').exists()).toBe(false)
  })

  it('re-centers the active lyric when lyrics are replaced but the active index resolves to the same value', async () => {
    const store = usePlayerStore()
    store.initAudio()
    store.setLyricsArray([
      { time: 0, text: 'Old 1', trans: '', roma: '' },
      { time: 5, text: 'Old 2', trans: '', roma: '' },
      { time: 10, text: 'Old 3', trans: '', roma: '' }
    ])
    store.progress = 6
    store.updateLyricIndex(6)

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

    let lyricLines = wrapper.findAll('.lyric-line')
    Object.defineProperty(lyricLines[1].element, 'offsetTop', {
      configurable: true,
      value: 260
    })
    Object.defineProperty(lyricLines[1].element, 'offsetHeight', {
      configurable: true,
      value: 40
    })

    scrollToMock.mockClear()
    scrollArea.scrollTop = 96

    store.setLyricsArray([
      { time: 0, text: 'New 1', trans: '', roma: '' },
      { time: 5, text: 'New 2', trans: '', roma: '' },
      { time: 10, text: 'New 3', trans: '', roma: '' }
    ])
    await nextTick()
    await nextTick()

    lyricLines = wrapper.findAll('.lyric-line')
    Object.defineProperty(lyricLines[1].element, 'offsetTop', {
      configurable: true,
      value: 260
    })
    Object.defineProperty(lyricLines[1].element, 'offsetHeight', {
      configurable: true,
      value: 40
    })

    await nextTick()
    await nextTick()

    expect(store.currentLyricIndex).toBe(1)
    expect(scrollArea.scrollTop).toBe(0)
    expect(scrollArea.scrollTo).toHaveBeenCalledWith({
      top: 180,
      behavior: 'auto'
    })
  })
})
