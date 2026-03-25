export type DebouncedFunction<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void
  flush: () => void
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay = 300
): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: TArgs | null = null

  const clearTimer = () => {
    if (!timer) {
      return
    }

    clearTimeout(timer)
    timer = null
  }

  const invoke = () => {
    if (!pendingArgs) {
      return
    }

    const args = pendingArgs
    pendingArgs = null
    timer = null
    fn(...args)
  }

  const debounced = ((...args: TArgs): void => {
    pendingArgs = args
    clearTimer()
    timer = setTimeout(() => {
      invoke()
    }, delay)
  }) as DebouncedFunction<TArgs>

  debounced.cancel = () => {
    clearTimer()
    pendingArgs = null
  }

  debounced.flush = () => {
    if (!pendingArgs) {
      clearTimer()
      return
    }

    clearTimer()
    invoke()
  }

  return debounced
}

export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  limit = 100
): (...args: TArgs) => void {
  let inThrottle = false

  return (...args: TArgs): void => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}
