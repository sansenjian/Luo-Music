import { afterEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../../src/store/toastStore'

describe('toastStore', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty toasts', () => {
    const store = useToastStore()
    expect(store.toasts).toEqual([])
    expect(store.nextId).toBe(0)
  })

  it('show adds a toast with default type', () => {
    const store = useToastStore()
    store.show('hello')
    expect(store.toasts).toHaveLength(1)
    expect(store.toasts[0]).toMatchObject({ message: 'hello', type: 'info' })
  })

  it('show auto-removes after duration', () => {
    vi.useFakeTimers()
    const store = useToastStore()
    store.show('bye', 'error', 3000)
    expect(store.toasts).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(store.toasts).toHaveLength(0)
  })

  it('remove deletes a specific toast', () => {
    const store = useToastStore()
    store.show('first')
    store.show('second')
    expect(store.toasts).toHaveLength(2)

    store.remove(store.toasts[0].id)
    expect(store.toasts).toHaveLength(1)
    expect(store.toasts[0].message).toBe('second')
  })

  it('remove ignores unknown id', () => {
    const store = useToastStore()
    store.show('only')
    store.remove(999)
    expect(store.toasts).toHaveLength(1)
  })

  it('success/error/warning/info delegate to show', () => {
    const store = useToastStore()
    const showSpy = vi.spyOn(store, 'show')

    store.success('ok')
    store.error('bad')
    store.warning('careful')
    store.info('fyi')

    expect(showSpy).toHaveBeenCalledWith('ok', 'success', 3000)
    expect(showSpy).toHaveBeenCalledWith('bad', 'error', 4000)
    expect(showSpy).toHaveBeenCalledWith('careful', 'warning', 3500)
    expect(showSpy).toHaveBeenCalledWith('fyi', 'info', 3000)
  })
})
