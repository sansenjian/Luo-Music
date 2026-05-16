import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  EventEmitter,
  onceEvent,
  filterEvent,
  mapEvent,
  debounceEvent,
  anyEvent
} from '@/base/common/event'

describe('EventEmitter', () => {
  it('should emit events to listeners', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    emitter.event(listener)
    emitter.fire(1)
    emitter.fire(2)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 1)
    expect(listener).toHaveBeenNthCalledWith(2, 2)

    emitter.dispose()
  })

  it('should return disposable that removes listener', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    const disposable = emitter.event(listener)
    emitter.fire(1)

    disposable.dispose()
    emitter.fire(2)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(1)

    emitter.dispose()
  })

  it('should not emit after dispose', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    emitter.event(listener)
    emitter.dispose()
    emitter.fire(1)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should handle listener removal during emit', () => {
    const emitter = new EventEmitter<number>()
    const calls: number[] = []

    const disposable1 = emitter.event(n => {
      calls.push(n)
      if (n === 1) disposable2.dispose()
    })

    const disposable2 = emitter.event(n => {
      calls.push(n * 10)
    })

    emitter.fire(1)
    emitter.fire(2)

    expect(calls).toEqual([1, 10, 2])

    emitter.dispose()
  })

  it('should track listener count', () => {
    const emitter = new EventEmitter<number>()

    expect(emitter.listenerCount).toBe(0)

    const d1 = emitter.event(() => {})
    expect(emitter.listenerCount).toBe(1)

    const d2 = emitter.event(() => {})
    expect(emitter.listenerCount).toBe(2)

    d1.dispose()
    expect(emitter.listenerCount).toBe(1)

    d2.dispose()
    expect(emitter.listenerCount).toBe(0)

    emitter.dispose()
  })
})

describe('Event utilities', () => {
  it('onceEvent should fire only once', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    onceEvent(emitter.event)(listener)

    emitter.fire(1)
    emitter.fire(2)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(1)

    emitter.dispose()
  })

  it('filterEvent should filter events', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    filterEvent(emitter.event, n => n > 5)(listener)

    emitter.fire(3)
    emitter.fire(7)
    emitter.fire(4)
    emitter.fire(8)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 7)
    expect(listener).toHaveBeenNthCalledWith(2, 8)

    emitter.dispose()
  })

  it('mapEvent should transform events', () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    mapEvent(emitter.event, n => n * 2)(listener)

    emitter.fire(1)
    emitter.fire(2)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 2)
    expect(listener).toHaveBeenNthCalledWith(2, 4)

    emitter.dispose()
  })

  it('debounceEvent should debounce events', async () => {
    const emitter = new EventEmitter<number>()
    const listener = vi.fn()

    debounceEvent(emitter.event, 50)(listener)

    emitter.fire(1)
    emitter.fire(2)
    emitter.fire(3)

    expect(listener).not.toHaveBeenCalled()

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(3)

    emitter.dispose()
  })

  it('anyEvent should combine multiple events', () => {
    const emitter1 = new EventEmitter<number>()
    const emitter2 = new EventEmitter<string>()
    const listener = vi.fn()

    anyEvent(emitter1.event as any, emitter2.event as any)(listener)

    emitter1.fire(1)
    emitter2.fire('a')

    expect(listener).toHaveBeenCalledTimes(2)

    emitter1.dispose()
    emitter2.dispose()
  })
})
