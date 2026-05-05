import { onMounted, onUnmounted, ref } from 'vue'

export type MountTier = 'frame' | 'idle'

export function useDeferredMount(tier: MountTier = 'frame') {
  const isMounted = ref(false)
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let idleHandle: number | null = null
  let rafHandle: number | null = null

  onMounted(() => {
    if (tier === 'idle' && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(
        () => {
          idleHandle = null
          isMounted.value = true
        },
        { timeout: 2000 }
      )
      return
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = null
        isMounted.value = true
      })
      return
    }

    fallbackTimer = setTimeout(() => {
      fallbackTimer = null
      isMounted.value = true
    }, 0)
  })

  onUnmounted(() => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    if (rafHandle !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
    if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleHandle)
      idleHandle = null
    }
  })

  return {
    isMounted
  }
}
