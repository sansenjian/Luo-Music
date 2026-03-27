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

import {
  PROGRAMMATIC_SCROLL_GUARD,
  USER_SCROLL_END_DEBOUNCE,
  USER_SCROLL_IDLE_DELAY
} from '@/constants/lyric'
import type { LyricLine } from '@/utils/player/core/lyric'

const ACTIVE_LINE_SELECTOR = '.lyric-line.active'
const SCROLL_ALIGNMENT_TOLERANCE = 2
const PROGRAMMATIC_SETTLE_NEAR_TARGET_DELAY = 40

type ScrollInteractionState = 'idle' | 'user' | 'programmatic'
type TimeoutHandle = ReturnType<typeof setTimeout> | null

interface ScrollRuntimeState {
  pauseActiveTimer: TimeoutHandle
  scrollEndTimer: TimeoutHandle
  programmaticSettleTimer: TimeoutHandle
  programmaticFallbackTimer: TimeoutHandle
  visibilityObserver: ResizeObserver | null
  interactionState: ScrollInteractionState
  programmaticTargetTop: number | null
}

interface ScrollGeometry {
  container: HTMLElement
  targetTop: number
}

export interface UseLyricAutoScrollOptions {
  scrollArea: Ref<HTMLElement | null>
  lyrics: MaybeRefOrGetter<LyricLine[]>
  activeIndex: MaybeRefOrGetter<number>
  active?: MaybeRefOrGetter<boolean>
  alignSources?: WatchSource<unknown>[]
  resetSources?: WatchSource<unknown>[]
}

/**
 * Coordinates automatic scrolling of a lyric container so the active lyric line remains aligned and visible.
 *
 * The composable observes active index, lyric list changes, alignment/reset triggers, container size, and user scroll interactions;
 * it differentiates programmatic scrolling from user-initiated scrolling to avoid feedback loops and to resume auto-scroll after user activity ceases.
 *
 * @param options - Configuration and reactive inputs:
 *   - scrollArea: A ref to the scrollable container element that holds lyric lines.
 *   - lyrics: A ref to the array of lyric entries.
 *   - activeIndex: A ref to the current active lyric index.
 *   - active: Optional boolean or ref that enables/disables auto-scroll (defaults to `true`).
 *   - alignSources: Optional array of reactive sources that, when changed, trigger alignment to the active line.
 *   - resetSources: Optional array of reactive sources that, when changed, reset scroll state and position.
 * @returns An object with control functions:
 *   - handleScroll: Call from the container's scroll handler to update internal user/programmatic state.
 *   - handleUserScrollStart: Mark the start of a user interaction (e.g., on `wheel` or `touchstart`) to temporarily suspend auto-scroll.
 *   - scrollToActiveLine: Programmatically align the container to the active lyric line; accepts an optional `ScrollBehavior`.
 *   - syncVisibleActiveLine: After DOM updates, attempts to align the active lyric line when synchronization prerequisites are met.
 */
export function useLyricAutoScroll(options: UseLyricAutoScrollOptions) {
  const {
    scrollArea,
    lyrics,
    activeIndex,
    active = true,
    alignSources = [],
    resetSources = []
  } = options

  const runtime: ScrollRuntimeState = {
    pauseActiveTimer: null,
    scrollEndTimer: null,
    programmaticSettleTimer: null,
    programmaticFallbackTimer: null,
    visibilityObserver: null,
    interactionState: 'idle',
    programmaticTargetTop: null
  }

  function clearTimer(timer: TimeoutHandle) {
    if (timer) {
      clearTimeout(timer)
    }

    return null
  }

  function getContainer() {
    return scrollArea.value
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

  function clearUserResumeTimers() {
    runtime.pauseActiveTimer = clearTimer(runtime.pauseActiveTimer)
    runtime.scrollEndTimer = clearTimer(runtime.scrollEndTimer)
  }

  function clearProgrammaticGuard() {
    runtime.programmaticSettleTimer = clearTimer(runtime.programmaticSettleTimer)
    runtime.programmaticFallbackTimer = clearTimer(runtime.programmaticFallbackTimer)
    runtime.programmaticTargetTop = null

    if (runtime.interactionState === 'programmatic') {
      runtime.interactionState = 'idle'
    }
  }

  function startProgrammaticScroll(targetTop: number, behavior: ScrollBehavior) {
    clearProgrammaticGuard()
    runtime.interactionState = 'programmatic'
    runtime.programmaticTargetTop = targetTop

    const fallbackDelay =
      behavior === 'smooth'
        ? PROGRAMMATIC_SCROLL_GUARD
        : Math.min(PROGRAMMATIC_SCROLL_GUARD, USER_SCROLL_END_DEBOUNCE)

    runtime.programmaticFallbackTimer = setTimeout(() => {
      clearProgrammaticGuard()
    }, fallbackDelay)
  }

  function refreshProgrammaticGuard(delay: number) {
    if (runtime.interactionState !== 'programmatic') {
      return
    }

    const safeDelay = Math.max(0, delay)
    runtime.programmaticSettleTimer = clearTimer(runtime.programmaticSettleTimer)
    runtime.programmaticFallbackTimer = clearTimer(runtime.programmaticFallbackTimer)

    runtime.programmaticSettleTimer = setTimeout(() => {
      clearProgrammaticGuard()
    }, safeDelay)

    runtime.programmaticFallbackTimer = setTimeout(() => {
      clearProgrammaticGuard()
    }, Math.max(PROGRAMMATIC_SCROLL_GUARD, safeDelay))
  }

  function resolveActiveLineScrollGeometry(): ScrollGeometry | null {
    const container = getContainer()
    if (!container || !isActive()) {
      return null
    }

    const activeLine = container.querySelector<HTMLElement>(ACTIVE_LINE_SELECTOR)
    if (!activeLine) {
      return null
    }

    const containerHeight = container.clientHeight
    if (containerHeight <= 0) {
      return null
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - containerHeight)
    const centeredTop = Math.max(
      0,
      activeLine.offsetTop - (containerHeight - activeLine.offsetHeight) / 2
    )

    return {
      container,
      targetTop: Math.min(centeredTop, maxScrollTop)
    }
  }

  function scrollToActiveLine(behavior: ScrollBehavior = 'smooth') {
    if (runtime.interactionState === 'user') {
      return
    }

    const geometry = resolveActiveLineScrollGeometry()
    if (!geometry) {
      return
    }

    if (
      Math.abs(geometry.container.scrollTop - geometry.targetTop) < SCROLL_ALIGNMENT_TOLERANCE
    ) {
      return
    }

    startProgrammaticScroll(geometry.targetTop, behavior)
    geometry.container.scrollTo({
      top: geometry.targetTop,
      behavior
    })
  }

  function scheduleAutoScrollResume() {
    clearUserResumeTimers()

    runtime.scrollEndTimer = setTimeout(() => {
      runtime.scrollEndTimer = null
      runtime.pauseActiveTimer = setTimeout(() => {
        runtime.interactionState = 'idle'
        runtime.pauseActiveTimer = null
        scrollToActiveLine()
      }, USER_SCROLL_IDLE_DELAY)
    }, USER_SCROLL_END_DEBOUNCE)
  }

  function handleUserScrollStart() {
    clearProgrammaticGuard()
    clearUserResumeTimers()
    runtime.interactionState = 'user'
  }

  function handleScroll() {
    if (runtime.interactionState === 'programmatic') {
      const container = getContainer()
      if (!container || runtime.programmaticTargetTop == null) {
        clearProgrammaticGuard()
        return
      }

      const remainingDistance = Math.abs(container.scrollTop - runtime.programmaticTargetTop)
      refreshProgrammaticGuard(
        remainingDistance <= SCROLL_ALIGNMENT_TOLERANCE
          ? PROGRAMMATIC_SETTLE_NEAR_TARGET_DELAY
          : USER_SCROLL_END_DEBOUNCE
      )
      return
    }

    runtime.interactionState = 'user'
    scheduleAutoScrollResume()
  }

  function resetScrollState() {
    runtime.interactionState = 'idle'
    clearUserResumeTimers()
    clearProgrammaticGuard()
  }

  function resetScrollPosition() {
    const container = getContainer()
    if (container) {
      container.scrollTop = 0
    }
  }

  function canSyncVisibleActiveLine() {
    const container = getContainer()
    if (!container) {
      return false
    }

    if (!isActive() || !getLyrics().length || getActiveIndex() < 0) {
      return false
    }

    return container.clientHeight > 0
  }

  function syncVisibleActiveLine() {
    if (!canSyncVisibleActiveLine()) {
      return
    }

    // Wait for post-flush DOM updates before resolving the active line position.
    void nextTick().then(() => {
      scrollToActiveLine('auto')
    })
  }

  watch(
    () => getActiveIndex(),
    (index, previousIndex) => {
      if (index < 0 || index === previousIndex || !getLyrics().length) {
        return
      }

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

        scrollToActiveLine('auto')
      },
      { flush: 'post' }
    )
  }

  watch(
    lyrics,
    () => {
      resetScrollState()
      resetScrollPosition()
      syncVisibleActiveLine()
    },
    { flush: 'post' }
  )

  if (resetSources.length > 0) {
    watch(resetSources, () => {
      resetScrollState()
      resetScrollPosition()
    })
  }

  watch(
    () => isActive(),
    isNowActive => {
      if (!isNowActive) {
        return
      }

      syncVisibleActiveLine()
    },
    { flush: 'post' }
  )

  onMounted(() => {
    const container = getContainer()
    if (typeof ResizeObserver === 'undefined' || !container) {
      return
    }

    runtime.visibilityObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry || entry.contentRect.height <= 0) {
        return
      }

      syncVisibleActiveLine()
    })

    runtime.visibilityObserver.observe(container)
    syncVisibleActiveLine()
  })

  onUnmounted(() => {
    resetScrollState()

    if (runtime.visibilityObserver) {
      runtime.visibilityObserver.disconnect()
      runtime.visibilityObserver = null
    }
  })

  return {
    handleScroll,
    handleUserScrollStart,
    scrollToActiveLine,
    syncVisibleActiveLine
  }
}
