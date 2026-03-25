import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'

import './assets/main.css'
import './assets/components/index.css'
import App from './App.vue'
import router from './router'
import { setupServices } from './services'
import { getLogger } from './utils/logger'

const sentryDsn = import.meta.env.SENTRY_DSN
const sentryRelease = import.meta.env.SENTRY_RELEASE
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
const sentryEnabled = Boolean(sentryDsn) && import.meta.env.PROD && !isLocalhost
type SentryRendererModule = typeof import('@sentry/electron/renderer')

let sentryRenderer: SentryRendererModule | null = null

function captureSentryException(error: unknown): void {
  sentryRenderer?.captureException(error)
}

async function initializeSentry(): Promise<void> {
  if (!sentryEnabled) {
    return
  }

  if (sentryRenderer) {
    return
  }

  const sentry = await import('@sentry/electron/renderer')
  sentryRenderer = sentry

  sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: sentryRelease || undefined,
    integrations: [
      sentry.browserTracingIntegration(),
      sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false
      })
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  })

  sentry.setTags({
    'process.type': 'renderer',
    platform: navigator.platform || 'unknown',
    'app.environment': import.meta.env.MODE
  })

  if (sentryRelease) {
    sentry.setTag('app.release', sentryRelease)
  }

  sentry.setContext('runtime', {
    userAgent: navigator.userAgent
  })
}

async function initializePerformanceMonitoring(): Promise<void> {
  const { performanceMonitor } = await import('./utils/performance/monitor')
  performanceMonitor.init()
  window.addEventListener(
    'pagehide',
    () => {
      performanceMonitor.dispose()
    },
    { once: true }
  )
}

function scheduleNonCriticalInit(task: () => void | Promise<void>): void {
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

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

setupServices()

app.config.errorHandler = (err: unknown, _vm: unknown, info: string) => {
  getLogger().error('Main', 'Vue Error', { error: err, info })
  if (sentryEnabled) {
    captureSentryException(err)
  }
}

window.addEventListener('unhandledrejection', event => {
  getLogger().error('Main', 'Unhandled Promise Rejection', event.reason)
  if (sentryEnabled) {
    captureSentryException(event.reason)
  }
})

window.addEventListener('error', event => {
  console.error('Global Error:', event.error)
  if (sentryEnabled && event.error) {
    captureSentryException(event.error)
  }
})

app.use(pinia)
app.use(VueQueryPlugin)
app.use(router)

app.mount('#app')

scheduleNonCriticalInit(async () => {
  const tasks: Array<Promise<void>> = [initializeSentry()]

  if (import.meta.env.DEV) {
    tasks.push(initializePerformanceMonitoring())
  }

  await Promise.all(tasks)
})
