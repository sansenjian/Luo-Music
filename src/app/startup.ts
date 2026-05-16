import { services } from '@/services'
import { getLogger } from '@/utils/logger'
import { isElectronRuntime } from '@/utils/runtime'

const rendererStartedAt = performance.now()

export function formatStartupDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

export function logRendererStartup(label: string): void {
  if (!import.meta.env.DEV) {
    return
  }

  console.info(
    `[RendererStartup] ${label}: ${formatStartupDuration(performance.now() - rendererStartedAt)}`
  )
}

export function scheduleNonCriticalInit(task: () => void | Promise<void>): void {
  const runTask = () => {
    Promise.resolve(task()).catch(error => {
      getLogger().warn('Main', 'Non-critical init failed', error)
    })
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      runTask()
    })
    return
  }

  setTimeout(runTask, 0)
}

export async function initializePerformanceMonitoring(): Promise<void> {
  const { performanceMonitor } = await import('@/utils/performance/monitor')
  performanceMonitor.init()
  window.addEventListener(
    'pagehide',
    () => {
      performanceMonitor.dispose()
    },
    { once: true }
  )
}

export async function runRendererNonCriticalInit(options: {
  canLoadRendererSentry: boolean
  initializeSentry: () => Promise<void>
}): Promise<void> {
  const nonCriticalStartedAt = performance.now()
  const tasks: Array<Promise<void>> = []

  if (options.canLoadRendererSentry) {
    tasks.push(options.initializeSentry())
  }

  if (import.meta.env.DEV) {
    tasks.push(initializePerformanceMonitoring())
  }

  if (isElectronRuntime()) {
    tasks.push(
      services
        .plugins()
        .refreshPlatformDescriptors()
        .then(() => undefined)
    )
  }

  await Promise.all(tasks)
  if (import.meta.env.DEV) {
    console.info(
      `[RendererStartup] non-critical init: ${formatStartupDuration(
        performance.now() - nonCriticalStartedAt
      )} (total ${formatStartupDuration(performance.now() - rendererStartedAt)})`
    )
  }
}
