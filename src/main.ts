import * as Sentry from '@sentry/electron/renderer'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import { setupServices } from './services'
import { performanceMonitor } from './utils/performance/monitor'
import { getLogger } from './utils/logger'
import './assets/main.css'
import './assets/components/index.css'
import App from './App.vue'

const sentryDsn = import.meta.env.SENTRY_DSN
const sentryRelease = import.meta.env.SENTRY_RELEASE
const sentryEnabled = Boolean(sentryDsn)

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: sentryRelease || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false
      })
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  })
  Sentry.setTags({
    'process.type': 'renderer',
    platform: navigator.platform || 'unknown',
    'app.environment': import.meta.env.MODE
  })
  if (sentryRelease) {
    Sentry.setTag('app.release', sentryRelease)
  }
  Sentry.setContext('runtime', {
    userAgent: navigator.userAgent
  })
  console.log('[Sentry] 渲染进程监控已启动')
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

setupServices()

// 初始化性能监控
performanceMonitor.init()

function clearCookies(): void {
  try {
    const cookieString = document.cookie
    if (!cookieString) return
    const cookies = cookieString.split(';')
    cookies.forEach(cookie => {
      const eqPos = cookie.indexOf('=')
      const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim()
      if (!name) return
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  } catch (error) {
    getLogger().warn('Main', 'Failed to clear cookies', error)
  }
}

// Vue 全局错误处理
app.config.errorHandler = (err: unknown, vm: unknown, info: string) => {
  getLogger().error('Main', 'Vue Error', { error: err, info })
  // 可以发送到错误监控服务，如 Sentry
  if (sentryEnabled) {
    Sentry.captureException(err)
  }
}

// 未处理的 Promise 错误
window.addEventListener('unhandledrejection', event => {
  getLogger().error('Main', 'Unhandled Promise Rejection', event.reason)
  if (sentryEnabled) {
    Sentry.captureException(event.reason)
  }
})

// 全局 JS 错误
window.addEventListener('error', event => {
  console.error('Global Error:', event.error)
  if (sentryEnabled && event.error) {
    Sentry.captureException(event.error)
  }
})

clearCookies()

app.use(pinia)
app.use(router)
app.use(VueQueryPlugin)
app.mount('#app')
