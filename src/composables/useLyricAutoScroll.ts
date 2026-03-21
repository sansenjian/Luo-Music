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
import {
  USER_SCROLL_IDLE_DELAY,
  USER_SCROLL_END_DEBOUNCE,
  PROGRAMMATIC_SCROLL_GUARD
} from '../constants/lyric'

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

  type ScrollInteractionState = 'idle' | 'user' | 'programmatic'

  let pauseActiveTimer: ReturnType<typeof setTimeout> | null = null
  let scrollEndTimer: ReturnType<typeof setTimeout> | null = null
  let programmaticSettleTimer: ReturnType<typeof setTimeout> | null = null
  let programmaticFallbackTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityObserver: ResizeObserver | null = null
  let scrollInteractionState: ScrollInteractionState = 'idle'
  let programmaticTargetTop: number | null = null

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

  function clearProgrammaticScrollState() {
    programmaticSettleTimer = clearTimer(programmaticSettleTimer)
    programmaticFallbackTimer = clearTimer(programmaticFallbackTimer)
    programmaticTargetTop = null
    if (scrollInteractionState === 'programmatic') {
      scrollInteractionState = 'idle'
    }
  }

  function enterProgrammaticScroll(targetTop: number, behavior: ScrollBehavior) {
    clearProgrammaticScrollState()
    scrollInteractionState = 'programmatic'
    programmaticTargetTop = targetTop

    // Keep a finite fallback to avoid a stuck guard when browsers suppress scroll events.
    const fallbackDelay =
      behavior === 'smooth'
        ? PROGRAMMATIC_SCROLL_GUARD
        : Math.min(PROGRAMMATIC_SCROLL_GUARD, USER_SCROLL_END_DEBOUNCE)

    programmaticFallbackTimer = setTimeout(() => {
      clearProgrammaticScrollState()
    }, fallbackDelay)
  }

  function refreshProgrammaticSettleGuard(delay: number) {
    if (scrollInteractionState !== 'programmatic') {
      return
    }

    const safeDelay = Math.max(0, delay)
    programmaticSettleTimer = clearTimer(programmaticSettleTimer)
    programmaticFallbackTimer = clearTimer(programmaticFallbackTimer)

    programmaticSettleTimer = setTimeout(() => {
      clearProgrammaticScrollState()
    }, safeDelay)

    const fallbackDelay = Math.max(PROGRAMMATIC_SCROLL_GUARD, safeDelay)
    programmaticFallbackTimer = setTimeout(() => {
      clearProgrammaticScrollState()
    }, fallbackDelay)
  }

  function scrollToActiveLine(behavior: ScrollBehavior = 'smooth') {
    if (scrollInteractionState === 'user' || !isActive() || !scrollArea.value) return

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

    enterProgrammaticScroll(nextScrollTop, behavior)
    container.scrollTo({
      top: nextScrollTop,
      behavior
    })
  }

  function scheduleAutoScrollResume() {
    scrollEndTimer = clearTimer(scrollEndTimer)
    pauseActiveTimer = clearTimer(pauseActiveTimer)

    scrollEndTimer = setTimeout(() => {
      scrollEndTimer = null
      pauseActiveTimer = setTimeout(() => {
        scrollInteractionState = 'idle'
        pauseActiveTimer = null
        scrollToActiveLine()
      }, USER_SCROLL_IDLE_DELAY)
    }, USER_SCROLL_END_DEBOUNCE)
  }

  function handleUserScrollStart() {
    clearProgrammaticScrollState()
    scrollInteractionState = 'user'
    pauseActiveTimer = clearTimer(pauseActiveTimer)
  }

  function handleScroll() {
    if (scrollInteractionState === 'programmatic') {
      const container = scrollArea.value
      if (!container || programmaticTargetTop == null) {
        clearProgrammaticScrollState()
        return
      }

      const remainingDistance = Math.abs(container.scrollTop - programmaticTargetTop)
      refreshProgrammaticSettleGuard(remainingDistance <= 2 ? 40 : USER_SCROLL_END_DEBOUNCE)
      return
    }

    scrollInteractionState = 'user'
    scheduleAutoScrollResume()
  }

  function resetScrollState() {
    scrollInteractionState = 'idle'
    pauseActiveTimer = clearTimer(pauseActiveTimer)
    scrollEndTimer = clearTimer(scrollEndTimer)
    clearProgrammaticScrollState()
  }

  function syncVisibleActiveLine() {
    if (!isActive() || !scrollArea.value || !getLyrics().length || getActiveIndex() < 0) {
      return
    }

    if (scrollArea.value.clientHeight <= 0) {
      return
    }

    // onMounted 和 ResizeObserver 回调可能在 DOM 完全渲染前调用
    // 使用 nextTick 确保 DOM 已更新
    void nextTick().then(() => {
      scrollToActiveLine('auto')
    })
  }

  watch(
    () => toValue(activeIndex),
    (index, previousIndex) => {
      if (index < 0 || index === previousIndex || !toValue(lyrics).length) {
        return
      }

      // flush: 'post' 已经确保 DOM 更新后执行，不需要再 await nextTick()
      scrollToActiveLine(previousIndex == null || previousIndex < 0 ? 'auto' : 'smooth')
    },
    { flush: 'post' }
  )

  if (alignSources.length > 0) {
    watch(
      alignSources,
      () => {
        if (getActiveIndex() < 0 || !getLyrics().length) {
          return
        }

        // flush: 'post' 已经确保 DOM 更新后执行
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

    clearProgrammaticScrollState()
    scrollArea.value.scrollTop = 0

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
    isNowActive => {
      if (!isNowActive) {
        return
      }

      // flush: 'post' 已经确保 DOM 更新后执行
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
