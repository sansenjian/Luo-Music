export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay = 300
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  return (...args: TArgs): void => {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }
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
