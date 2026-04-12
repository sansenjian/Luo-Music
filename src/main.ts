import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

import './assets/main.css'
import App from './App.vue'
import router from './router'
import { setupServices } from './services'
import { getLogger } from './utils/logger'
import { isElectronRuntime } from './utils/runtime'

const sentryDsn = import.meta.env.SENTRY_DSN
const sentryRelease = import.meta.env.SENTRY_RELEASE
const sentryTracingEnabled = import.meta.env.SENTRY_TRACING_ENABLED === '1'
const sentryReplayEnabled = import.meta.env.SENTRY_REPLAY_ENABLED === '1'
const canLoadRendererSentry = import.meta.env.APP_RUNTIME === 'electron'
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
const sentryEnabled =
  canLoadRendererSentry &&
  Boolean(sentryDsn) &&
  import.meta.env.PROD &&
  isElectronRuntime() &&
  !isLocalhost

type SentryRendererModule = typeof import('./utils/monitoring/sentryRenderer')

let sentryRendererModule: SentryRendererModule | null = null
let sentryRendererModulePromise: Promise<SentryRendererModule> | null = null

async function loadRendererSentryModule(): Promise<SentryRendererModule> {
  if (sentryRendererModule) {
    return sentryRendererModule
  }

  if (!sentryRendererModulePromise) {
    sentryRendererModulePromise = import('./utils/monitoring/sentryRenderer').then(module => {
      sentryRendererModule = module
      return module
    })
  }

  return sentryRendererModulePromise
}

function captureSentryException(error: unknown): void {
  sentryRendererModule?.captureRendererException(error)
}

async function initializeSentry(): Promise<void> {
  if (!sentryEnabled) {
    return
  }

  const dsn = sentryDsn
  if (!dsn) {
    return
  }

  const sentryRenderer = await loadRendererSentryModule()

  await sentryRenderer.initializeRendererSentry({
    dsn,
    environment: import.meta.env.MODE,
    release: sentryRelease || undefined,
    tracingEnabled: sentryTracingEnabled,
    replayEnabled: sentryReplayEnabled,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
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
let vueQueryPluginInstalled = false
let vueQueryPluginPromise: Promise<void> | null = null

function routeRequiresVueQuery(route: RouteLocationNormalized): boolean {
  return route.matched.some(record => record.meta.requiresVueQuery === true)
}

async function ensureVueQueryPlugin(): Promise<void> {
  if (vueQueryPluginInstalled) {
    return
  }

  if (!vueQueryPluginPromise) {
    vueQueryPluginPromise = import('@tanstack/vue-query')
      .then(({ VueQueryPlugin }) => {
        if (vueQueryPluginInstalled) {
          return
        }

        app.use(VueQueryPlugin)
        vueQueryPluginInstalled = true
      })
      .catch(error => {
        getLogger().error('Main', 'Failed to install Vue Query plugin', error)
      })
      .finally(() => {
        if (!vueQueryPluginInstalled) {
          vueQueryPluginPromise = null
        }
      })
  }

  await vueQueryPluginPromise
}

router.beforeResolve(async to => {
  if (!routeRequiresVueQuery(to)) {
    return
  }

  await ensureVueQueryPlugin()
})

setupServices()

app.config.errorHandler = (err: unknown, _vm: unknown, info: string) => {
  getLogger().error('Main', 'Vue Error', { error: err, info })
  captureSentryException(err)
}

window.addEventListener('unhandledrejection', event => {
  getLogger().error('Main', 'Unhandled Promise Rejection', event.reason)
  captureSentryException(event.reason)
})

window.addEventListener('error', event => {
  console.error('Global Error:', event.error)
  if (event.error) {
    captureSentryException(event.error)
  }
})

app.use(pinia)
app.use(router)

app.mount('#app')

scheduleNonCriticalInit(async () => {
  const tasks: Array<Promise<void>> = []

  if (canLoadRendererSentry) {
    tasks.push(initializeSentry())
  }

  if (import.meta.env.DEV) {
    tasks.push(initializePerformanceMonitoring())
  }

  await Promise.all(tasks)
})
