import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import {
  PROGRAMMATIC_SCROLL_GUARD,
  USER_SCROLL_END_DEBOUNCE,
  USER_SCROLL_IDLE_DELAY
} from '../../src/constants/lyric'
import { useLyricAutoScroll } from '../../src/composables/useLyricAutoScroll'
import type { LyricLine } from '../../src/utils/player/core/lyric'

type AutoScrollApi = ReturnType<typeof useLyricAutoScroll>

interface HarnessExpose {
  api: AutoScrollApi
  scrollArea: Ref<HTMLElement | null>
  lyrics: Ref<LyricLine[]>
  activeIndex: Ref<number>
}

interface HarnessContext {
  wrapper: VueWrapper
  exposed: HarnessExpose
  container: HTMLElement
  scrollToMock: ReturnType<typeof vi.fn>
}

function createContainer() {
  const activeLine = {
    offsetTop: 260,
    offsetHeight: 40
  } as HTMLElement

  const scrollToMock = vi.fn()
  const container = {
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 200,
    querySelector: vi.fn((selector: string) => {
      if (selector === '.lyric-line.active') {
        return activeLine
      }
      return null
    }),
    scrollTo: (options: ScrollToOptions) => {
      scrollToMock(options)
    }
  } as unknown as HTMLElement

  return { container, scrollToMock }
}

async function mountHarness(): Promise<HarnessContext> {
  const { container, scrollToMock } = createContainer()

  const Harness = defineComponent({
    setup(_, { expose }) {
      const scrollArea = ref<HTMLElement | null>(container)
      const lyrics = ref<LyricLine[]>([{ time: 1, text: 'Line', trans: '', roma: '' }])
      const activeIndex = ref(0)
      const api = useLyricAutoScroll({
        scrollArea,
        lyrics,
        activeIndex
      })

      expose({
        api,
        scrollArea,
        lyrics,
        activeIndex
      })

      return () => h('div')
    }
  })

  const wrapper = mount(Harness)
  await nextTick()
  await nextTick()

  return {
    wrapper,
    exposed: wrapper.vm as unknown as HarnessExpose,
    container,
    scrollToMock
  }
}

describe('useLyricAutoScroll', () => {
  const wrappers: VueWrapper[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
  })

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount()
    }

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('treats explicit user scroll intent as user interaction even during programmatic guard', async () => {
    const context = await mountHarness()
    wrappers.push(context.wrapper)

    context.scrollToMock.mockClear()
    context.exposed.api.scrollToActiveLine('smooth')
    context.scrollToMock.mockClear()

    context.exposed.api.handleUserScrollStart()
    context.exposed.api.handleScroll()
    vi.advanceTimersByTime(USER_SCROLL_END_DEBOUNCE + USER_SCROLL_IDLE_DELAY + 5)
    await nextTick()

    expect(context.scrollToMock).toHaveBeenCalledTimes(1)
    expect(context.scrollToMock).toHaveBeenLastCalledWith({
      top: 180,
      behavior: 'smooth'
    })
  })

  it('keeps programmatic guard alive while smooth scrolling events are still arriving', async () => {
    const context = await mountHarness()
    wrappers.push(context.wrapper)

    context.scrollToMock.mockClear()
    context.exposed.api.scrollToActiveLine('smooth')
    context.scrollToMock.mockClear()

    context.container.scrollTop = 64
    vi.advanceTimersByTime(PROGRAMMATIC_SCROLL_GUARD - 40)
    context.exposed.api.handleScroll()

    vi.advanceTimersByTime(60)
    context.container.scrollTop = 128
    context.exposed.api.handleScroll()

    vi.advanceTimersByTime(USER_SCROLL_END_DEBOUNCE + USER_SCROLL_IDLE_DELAY + 5)
    await nextTick()

    expect(context.scrollToMock).not.toHaveBeenCalled()
  })

  it('releases the programmatic guard quickly after reaching target', async () => {
    const context = await mountHarness()
    wrappers.push(context.wrapper)

    context.scrollToMock.mockClear()
    context.exposed.api.scrollToActiveLine('smooth')
    context.scrollToMock.mockClear()

    context.container.scrollTop = 180
    context.exposed.api.handleScroll()

    vi.advanceTimersByTime(45)
    context.container.scrollTop = 48
    context.exposed.api.handleUserScrollStart()
    context.exposed.api.handleScroll()
    vi.advanceTimersByTime(USER_SCROLL_END_DEBOUNCE + USER_SCROLL_IDLE_DELAY + 5)
    await nextTick()

    expect(context.scrollToMock).toHaveBeenCalledTimes(1)
    expect(context.scrollToMock).toHaveBeenLastCalledWith({
      top: 180,
      behavior: 'smooth'
    })
  })

  it('cancels a pending auto-resume when the user starts scrolling again', async () => {
    const context = await mountHarness()
    wrappers.push(context.wrapper)

    context.scrollToMock.mockClear()
    context.exposed.api.scrollToActiveLine('smooth')
    context.scrollToMock.mockClear()

    context.exposed.api.handleUserScrollStart()
    context.exposed.api.handleScroll()

    vi.advanceTimersByTime(USER_SCROLL_END_DEBOUNCE - 20)

    context.exposed.api.handleUserScrollStart()
    context.exposed.api.handleScroll()

    vi.advanceTimersByTime(USER_SCROLL_END_DEBOUNCE + USER_SCROLL_IDLE_DELAY - 1)
    await nextTick()

    expect(context.scrollToMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2)
    await nextTick()

    expect(context.scrollToMock).toHaveBeenCalledTimes(1)
    expect(context.scrollToMock).toHaveBeenLastCalledWith({
      top: 180,
      behavior: 'smooth'
    })
  })
})
