import { onMounted, onUnmounted, ref } from 'vue'

export type MountTier = 'frame' | 'idle'

export function useDeferredMount(tier: MountTier = 'frame') {
  const isMounted = ref(false)
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let idleHandle: number | null = null

  onMounted(() => {
    if (tier === 'idle' && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(
        () => {
          isMounted.value = true
        },
        { timeout: 2000 }
      )
      return
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        isMounted.value = true
      })
      return
    }

    fallbackTimer = setTimeout(() => {
      isMounted.value = true
    }, 0)
  })

  onUnmounted(() => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
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
