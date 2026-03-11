import { describe, it, expect, vi } from 'vitest'
import { Disposable, DisposableStore, ReferenceDisposable, DisposableTracker } from '../../src/base/common/lifecycle'

describe('Disposable', () => {
  it('should dispose registered resources', () => {
    const disposable = new Disposable()
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()

    disposable.register({ dispose: dispose1 })
    disposable.register({ dispose: dispose2 })

    expect(dispose1).not.toHaveBeenCalled()
    expect(dispose2).not.toHaveBeenCalled()

    disposable.dispose()

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(dispose2).toHaveBeenCalledTimes(1)
  })

  it('should dispose resources in reverse order', () => {
    const disposable = new Disposable()
    const order: number[] = []

    disposable.register({ dispose: () => order.push(1) })
    disposable.register({ dispose: () => order.push(2) })
    disposable.register({ dispose: () => order.push(3) })

    disposable.dispose()

    expect(order).toEqual([3, 2, 1])
  })

  it('should immediately dispose resources registered after disposal', () => {
    const disposable = new Disposable()
    const dispose1 = vi.fn()

    disposable.dispose()
    disposable.register({ dispose: dispose1 })

    expect(dispose1).toHaveBeenCalledTimes(1)
  })

  it('should not dispose twice', () => {
    const disposable = new Disposable()
    const dispose1 = vi.fn()

    disposable.register({ dispose: dispose1 })
    disposable.dispose()
    disposable.dispose()

    expect(dispose1).toHaveBeenCalledTimes(1)
  })

  it('should track disposed state', () => {
    const disposable = new Disposable()

    expect(disposable.disposed).toBe(false)
    disposable.dispose()
    expect(disposable.disposed).toBe(true)
  })

  it('Disposable.from should create disposable from function', () => {
    const dispose = vi.fn()
    const disposable = Disposable.from(dispose)

    expect(dispose).not.toHaveBeenCalled()
    disposable.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('Disposable.combine should combine multiple disposables', () => {
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()
    const combined = Disposable.combine(
      { dispose: dispose1 },
      { dispose: dispose2 }
    )

    combined.dispose()

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(dispose2).toHaveBeenCalledTimes(1)
  })
})

describe('DisposableStore', () => {
  it('should manage multiple disposables', () => {
    const store = new DisposableStore()
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()

    store.add({ dispose: dispose1 })
    store.add({ dispose: dispose2 })

    expect(store.size).toBe(2)

    store.dispose()

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(dispose2).toHaveBeenCalledTimes(1)
    expect(store.disposed).toBe(true)
  })

  it('should delete and dispose specific item', () => {
    const store = new DisposableStore()
    const dispose1 = vi.fn()
    const d1 = { dispose: dispose1 }

    store.add(d1)
    expect(store.size).toBe(1)

    store.delete(d1)

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(store.size).toBe(0)
  })

  it('should clear all disposables', () => {
    const store = new DisposableStore()
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()

    store.add({ dispose: dispose1 })
    store.add({ dispose: dispose2 })

    store.clear()

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(dispose2).toHaveBeenCalledTimes(1)
    expect(store.size).toBe(0)
    expect(store.disposed).toBe(false)
  })
})

describe('ReferenceDisposable', () => {
  it('should dispose when ref count reaches zero', () => {
    const dispose = vi.fn()
    const ref = new ReferenceDisposable({ dispose })

    expect(ref.refCount).toBe(1)
    expect(dispose).not.toHaveBeenCalled()

    ref.dispose()

    expect(ref.refCount).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('should not dispose until all references are released', () => {
    const dispose = vi.fn()
    const ref = new ReferenceDisposable({ dispose })

    ref.acquire()
    expect(ref.refCount).toBe(2)

    ref.dispose()
    expect(ref.refCount).toBe(1)
    expect(dispose).not.toHaveBeenCalled()

    ref.dispose()
    expect(ref.refCount).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('DisposableTracker', () => {
  it('should track disposables by id', () => {
    const tracker = new DisposableTracker()
    const dispose1 = vi.fn()

    tracker.track('item1', { dispose: dispose1 })

    expect(tracker.has('item1')).toBe(true)
    expect(tracker.size).toBe(1)

    tracker.dispose('item1')

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(tracker.has('item1')).toBe(false)
  })

  it('should replace existing item with same id', () => {
    const tracker = new DisposableTracker()
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()

    tracker.track('item1', { dispose: dispose1 })
    tracker.track('item1', { dispose: dispose2 })

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(tracker.size).toBe(1)
  })

  it('should dispose all items', () => {
    const tracker = new DisposableTracker()
    const dispose1 = vi.fn()
    const dispose2 = vi.fn()

    tracker.track('item1', { dispose: dispose1 })
    tracker.track('item2', { dispose: dispose2 })

    tracker.disposeAll()

    expect(dispose1).toHaveBeenCalledTimes(1)
    expect(dispose2).toHaveBeenCalledTimes(1)
    expect(tracker.size).toBe(0)
  })
})