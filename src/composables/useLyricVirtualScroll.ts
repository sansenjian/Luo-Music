import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

interface VirtualScrollOptions {
  scrollArea: Ref<HTMLElement | null>
  itemCount: Ref<number>
  overscan?: number
}

const ESTIMATED_LINE_HEIGHT = 56

/**
 * Virtual scroll for variable-height lyric lines.
 *
 * Measures real DOM heights via ResizeObserver on rendered lines
 * and caches them.  Only renders lines visible in the viewport
 * (plus overscan buffer).
 */
export function useLyricVirtualScroll(options: VirtualScrollOptions) {
  const { scrollArea, itemCount, overscan = 8 } = options

  const scrollTop = ref(0)
  const containerHeight = ref(0)
  const heightCache: number[] = []
  let resizeObserver: ResizeObserver | null = null
  let scrollHandler: (() => void) | null = null
  // Active index that must always be rendered, even if outside the
  // viewport-based visible range.
  const pinnedIndex = ref(-1)

  // Incremented when heightCache changes to invalidate computed caches
  const heightVersion = ref(0)

  function getCachedHeight(index: number): number {
    return index < heightCache.length && heightCache[index] > 0
      ? heightCache[index]
      : ESTIMATED_LINE_HEIGHT
  }

  function getOffsetForIndex(index: number): number {
    let offset = 0
    const count = Math.min(index, itemCount.value)
    for (let i = 0; i < count; i++) {
      offset += getCachedHeight(i)
    }
    return offset
  }

  const totalHeight = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    heightVersion.value
    let total = 0
    for (let i = 0; i < itemCount.value; i++) {
      total += getCachedHeight(i)
    }
    return total
  })

  const startIndex = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    heightVersion.value
    let accumulated = 0
    const top = scrollTop.value
    let result = 0
    for (let i = 0; i < itemCount.value; i++) {
      const h = getCachedHeight(i)
      if (accumulated + h > top) {
        result = Math.max(0, i - overscan)
        break
      }
      accumulated += h
    }
    // Expand to include pinned active line
    if (pinnedIndex.value >= 0 && pinnedIndex.value < itemCount.value) {
      result = Math.min(result, Math.max(0, pinnedIndex.value - overscan))
    }
    return result
  })

  const endIndex = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    heightVersion.value
    const bottom = scrollTop.value + containerHeight.value
    let accumulated = getOffsetForIndex(startIndex.value)
    let result = itemCount.value
    for (let i = startIndex.value; i < itemCount.value; i++) {
      accumulated += getCachedHeight(i)
      if (accumulated >= bottom) {
        result = Math.min(itemCount.value, i + overscan + 1)
        break
      }
    }
    // Expand to include pinned active line
    if (pinnedIndex.value >= 0 && pinnedIndex.value < itemCount.value) {
      result = Math.max(result, Math.min(itemCount.value, pinnedIndex.value + overscan + 1))
    }
    return result
  })

  const paddingTop = computed(() => getOffsetForIndex(startIndex.value))
  const paddingBottom = computed(() =>
    Math.max(0, totalHeight.value - getOffsetForIndex(endIndex.value))
  )

  function updateScrollState() {
    const el = scrollArea.value
    if (!el) return
    scrollTop.value = el.scrollTop
    containerHeight.value = el.clientHeight
  }

  function cacheHeight(index: number, height: number) {
    if (height <= 0) return
    while (heightCache.length <= index) heightCache.push(0)
    if (heightCache[index] !== height) {
      heightCache[index] = height
      heightVersion.value++
    }
  }

  function observeLineHeights() {
    const el = scrollArea.value
    if (!el || typeof ResizeObserver === 'undefined') return

    resizeObserver = new ResizeObserver(entries => {
      let changed = false
      for (const entry of entries) {
        const target = entry.target as HTMLElement
        const indexAttr = target.dataset.li
        if (indexAttr == null) continue
        const index = parseInt(indexAttr, 10)
        if (isNaN(index)) continue
        const h = entry.contentRect.height
        if (h > 0 && heightCache[index] !== h) {
          cacheHeight(index, h)
          changed = true
        }
      }
      if (changed) {
        updateScrollState()
      }
    })

    resizeObserver.observe(el)
  }

  function measureLineEl(el: HTMLElement) {
    const indexAttr = el.dataset.li
    if (indexAttr == null) return
    const index = parseInt(indexAttr, 10)
    if (isNaN(index)) return
    const h = el.getBoundingClientRect().height
    cacheHeight(index, h)
  }

  function clearCache() {
    heightCache.length = 0
    heightVersion.value++
  }

  watch(itemCount, () => {
    clearCache()
    updateScrollState()
  })

  onMounted(() => {
    const el = scrollArea.value
    if (!el) return

    scrollHandler = () => updateScrollState()
    el.addEventListener('scroll', scrollHandler, { passive: true })
    updateScrollState()
    observeLineHeights()
  })

  onUnmounted(() => {
    const el = scrollArea.value
    if (el && scrollHandler) {
      el.removeEventListener('scroll', scrollHandler)
    }
    resizeObserver?.disconnect()
    resizeObserver = null
    scrollHandler = null
  })

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
    measureLineEl,
    clearCache,
    updateScrollState,
    pinActiveIndex: (index: number) => {
      pinnedIndex.value = index
    }
  }
}
