import { onMounted, onUnmounted, ref } from 'vue'

export function useDeferredMount() {
  const isMounted = ref(false)
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
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
  })

  return {
    isMounted
  }
}
