import { ref, onBeforeUnmount } from 'vue'

export interface SliderOptions {
  /** Update callback (percent: number) => void */
  onUpdate: (percent: number) => void
  /** Get current value callback () => number (0-1) */
  getValue: () => number
  /** Move threshold to distinguish click from drag, default 3px */
  moveThreshold?: number
}

export function useSlider(options: SliderOptions) {
  const { onUpdate, getValue, moveThreshold = 3 } = options

  const isDragging = ref(false)
  let rect: DOMRect | null = null
  let rafId: number | null = null
  let didMove = false

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    isDragging.value = true
    const target = e.currentTarget as HTMLElement
    rect = target.getBoundingClientRect()
    target.setPointerCapture?.(e.pointerId)
    updateFromEvent(e)
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging.value || !rect) return
    e.preventDefault()

    // Check move threshold
    if (!didMove) {
      const currentValue = getValue()
      // Calculate current pixel position
      const currentX = rect.width * currentValue
      const deltaX = Math.abs(e.clientX - rect.left - currentX)

      if (deltaX > moveThreshold) {
        didMove = true
      }
    }

    // RAF throttle
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      updateFromEvent(e)
      rafId = null
    })
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging.value) return

    // Apply final position
    if (rect?.width) {
      updateFromEvent(e)
    }

    isDragging.value = false
    rect = null
    const target = e.currentTarget as HTMLElement
    target.releasePointerCapture?.(e.pointerId)

    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    // Delay resetting move flag to ensure click handler can detect drag state
    setTimeout(() => {
      didMove = false
    }, 50)
  }

  function handleClick(e: MouseEvent) {
    if (isDragging.value) return
    if (didMove) {
      didMove = false
      return
    }

    const target = e.currentTarget as HTMLElement
    rect = target.getBoundingClientRect()
    if (rect.width === 0) return

    updateFromEvent(e)
    rect = null
  }

  function updateFromEvent(e: { clientX: number }) {
    if (!rect?.width) return
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onUpdate(percent)
  }

  onBeforeUnmount(() => {
    if (rafId) cancelAnimationFrame(rafId)
  })

  return {
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClick
  }
}
