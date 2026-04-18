import { onMounted, ref } from 'vue'

export function useDeferredMount() {
  const isMounted = ref(false)

  onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        isMounted.value = true
      })
      return
    }

    setTimeout(() => {
      isMounted.value = true
    }, 0)
  })

  return {
    isMounted
  }
}
