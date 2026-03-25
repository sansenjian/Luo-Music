import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const webVitalsMocks = vi.hoisted(() => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn()
}))

vi.mock('web-vitals', () => ({
  onCLS: webVitalsMocks.onCLS,
  onINP: webVitalsMocks.onINP,
  onLCP: webVitalsMocks.onLCP,
  onFCP: webVitalsMocks.onFCP,
  onTTFB: webVitalsMocks.onTTFB
}))

type PerformanceMonitorSingleton = typeof import('@/utils/performance/monitor')['performanceMonitor']

describe('performanceMonitor', () => {
  const originalMemoryDescriptor = Object.getOwnPropertyDescriptor(performance, 'memory')

  let performanceMonitor: PerformanceMonitorSingleton

  let frameRequestId = 0
  let requestAnimationFrameMock: ReturnType<typeof vi.fn>
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>
  let setIntervalSpy: ReturnType<typeof vi.spyOn>
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.clearAllMocks()
    frameRequestId = 0

    ;({ performanceMonitor } = await import('@/utils/performance/monitor'))

    requestAnimationFrameMock = vi.fn((_callback: FrameRequestCallback) => {
      frameRequestId += 1
      return frameRequestId
    })
    cancelAnimationFrameMock = vi.fn()

    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock)

    setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        usedJSHeapSize: 128 * 1024 * 1024,
        totalJSHeapSize: 192 * 1024 * 1024,
        jsHeapSizeLimit: 256 * 1024 * 1024
      }
    })

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    performanceMonitor.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()

    if (originalMemoryDescriptor) {
      Object.defineProperty(performance, 'memory', originalMemoryDescriptor)
    } else {
      delete (performance as Performance & { memory?: unknown }).memory
    }
  })

  it('disposes scheduled monitors and supports re-init without duplicating web vitals hooks', () => {
    performanceMonitor.init()

    expect(webVitalsMocks.onCLS).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onINP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onLCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onFCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onTTFB).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    const scheduledFrameId = requestAnimationFrameMock.mock.results[0]?.value as number
    const scheduledIntervalId = setIntervalSpy.mock.results[0]?.value as ReturnType<typeof setInterval>

    performanceMonitor.dispose()

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(scheduledFrameId)
    expect(clearIntervalSpy).toHaveBeenCalledWith(scheduledIntervalId)

    performanceMonitor.init()

    expect(webVitalsMocks.onCLS).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onINP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onLCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onFCP).toHaveBeenCalledTimes(1)
    expect(webVitalsMocks.onTTFB).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2)
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
  })

  it('emits metric snapshots through onDidChangeMetrics when web vitals report updates', () => {
    const listener = vi.fn()
    const disposeListener = performanceMonitor.onDidChangeMetrics(listener)

    performanceMonitor.init()

    const clsHandler = webVitalsMocks.onCLS.mock.calls[0]?.[0] as (metric: {
      name: string
      value: number
      rating: 'good' | 'needs-improvement' | 'poor'
      delta: number
      id: string
    }) => void

    clsHandler({
      name: 'CLS',
      value: 0.12,
      rating: 'good',
      delta: 0.12,
      id: 'cls-metric'
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        CLS: 0.12,
        fps: 0
      })
    )

    disposeListener.dispose()
  })
})
