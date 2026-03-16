import {
  nextTick,
  onMounted,
  onUnmounted,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type WatchSource
} from 'vue'

import type { LyricLine } from '../utils/player/core/lyric'

const USER_SCROLL_IDLE_DELAY = 900
const USER_SCROLL_END_DEBOUNCE = 120
const PROGRAMMATIC_SCROLL_GUARD = 380

export interface UseLyricAutoScrollOptions {
  scrollArea: Ref<HTMLElement | null>
  lyrics: MaybeRefOrGetter<LyricLine[]>
  activeIndex: MaybeRefOrGetter<number>
  active?: MaybeRefOrGetter<boolean>
  alignSources?: WatchSource<unknown>[]
  resetSources?: WatchSource<unknown>[]
}

export function useLyricAutoScroll(options: UseLyricAutoScrollOptions) {
  const {
    scrollArea,
    lyrics,
    activeIndex,
    active = true,
    alignSources = [],
    resetSources = []
  } = options

  let pauseActiveTimer: ReturnType<typeof setTimeout> | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout> | null = null
  let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityObserver: ResizeObserver | null = null
  let isUserScrolling = false
  let isProgrammaticScrolling = false

  function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer) {
      clearTimeout(timer)
    }

    return null
  }

  function isActive() {
    return toValue(active)
  }

  function getLyrics() {
    return toValue(lyrics)
  }

  function getActiveIndex() {
    return toValue(activeIndex)
  }

  function releaseProgrammaticScrollGuard(delay = PROGRAMMATIC_SCROLL_GUARD) {
    programmaticScrollTimer = clearTimer(programmaticScrollTimer)

    if (delay <= 0) {
      isProgrammaticScrolling = false
      return
    }

    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScrolling = false
      programmaticScrollTimer = null
    }, delay)
  }

  function scrollToActiveLine(behavior: ScrollBehavior = 'smooth') {
    if (isUserScrolling || !isActive() || !scrollArea.value) return

    const container = scrollArea.value
    const activeLine = container.querySelector<HTMLElement>('.lyric-line.active')
    if (!activeLine) return

    const lineOffsetTop = activeLine.offsetTop
    const lineHeight = activeLine.offsetHeight
    const containerHeight = container.clientHeight
    if (containerHeight <= 0) return

    const maxScrollTop = Math.max(0, container.scrollHeight - containerHeight)
    const targetScrollTop = Math.max(0, lineOffsetTop - (containerHeight - lineHeight) / 2)
    const nextScrollTop = Math.min(targetScrollTop, maxScrollTop)

    if (Math.abs(container.scrollTop - nextScrollTop) < 2) {
      return
    }

    isProgrammaticScrolling = true
    container.scrollTo({
      top: nextScrollTop,
      behavior
    })
    releaseProgrammaticScrollGuard(behavior === 'smooth' ? PROGRAMMATIC_SCROLL_GUARD : 0)
  }

  function scheduleAutoScrollResume() {
    scrollEndTimer = clearTimer(scrollEndTimer)
    pauseActiveTimer = clearTimer(pauseActiveTimer)

    scrollEndTimer = setTimeout(() => {
      scrollEndTimer = null
      pauseActiveTimer = setTimeout(() => {
        isUserScrolling = false
        pauseActiveTimer = null
        scrollToActiveLine()
      }, USER_SCROLL_IDLE_DELAY)
    }, USER_SCROLL_END_DEBOUNCE)
  }

  function handleUserScrollStart() {
    if (isProgrammaticScrolling) {
      return
    }

    isUserScrolling = true
    pauseActiveTimer = clearTimer(pauseActiveTimer)
  }

  function handleScroll() {
    if (isProgrammaticScrolling) {
      return
    }

    isUserScrolling = true
    scheduleAutoScrollResume()
  }

  function resetScrollState() {
    isUserScrolling = false
    pauseActiveTimer = clearTimer(pauseActiveTimer)
    scrollEndTimer = clearTimer(scrollEndTimer)
    programmaticScrollTimer = clearTimer(programmaticScrollTimer)
    isProgrammaticScrolling = false
  }

  function syncVisibleActiveLine() {
    if (!isActive() || !scrollArea.value || !getLyrics().length || getActiveIndex() < 0) {
      return
    }

    if (scrollArea.value.clientHeight <= 0) {
      return
    }

    void nextTick().then(() => {
      scrollToActiveLine('auto')
    })
  }

  watch(
    () => toValue(activeIndex),
    async (index, previousIndex) => {
      if (index < 0 || index === previousIndex || !toValue(lyrics).length) {
        return
      }

      await nextTick()
      scrollToActiveLine(previousIndex == null || previousIndex < 0 ? 'auto' : 'smooth')
    },
    { flush: 'post' }
  )

  if (alignSources.length > 0) {
    watch(
      alignSources,
      async () => {
        if (getActiveIndex() < 0 || !getLyrics().length) {
          return
        }

        await nextTick()
        scrollToActiveLine('auto')
      },
      { flush: 'post' }
    )
  }

  watch(lyrics, _nextLyrics => {
    resetScrollState()

    if (!scrollArea.value) {
      return
    }

    isProgrammaticScrolling = true
    scrollArea.value.scrollTop = 0
    releaseProgrammaticScrollGuard(0)

    if (!toValue(lyrics).length) {
      return
    }
  })

  if (resetSources.length > 0) {
    watch(resetSources, () => {
      resetScrollState()

      if (scrollArea.value) {
        scrollArea.value.scrollTop = 0
      }
    })
  }

  watch(
    () => toValue(active),
    async isNowActive => {
      if (!isNowActive) {
        return
      }

      await nextTick()
      syncVisibleActiveLine()
    },
    { flush: 'post' }
  )

  onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !scrollArea.value) {
      return
    }

    visibilityObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry || entry.contentRect.height <= 0) {
        return
      }

      syncVisibleActiveLine()
    })

    visibilityObserver.observe(scrollArea.value)
    syncVisibleActiveLine()
  })

  onUnmounted(() => {
    resetScrollState()

    if (visibilityObserver) {
      visibilityObserver.disconnect()
      visibilityObserver = null
    }
  })

  return {
    handleScroll,
    handleUserScrollStart,
    scrollToActiveLine,
    syncVisibleActiveLine
  }
}
