import { createApp } from 'vue'

import './assets/main.css'
import App from './App.vue'
import {
  canLoadRendererSentry,
  captureSentryException,
  initializeSentry,
  installGlobalErrorHandlers,
  routeRequiresVueQuery
} from './app/sentry'
import {
  logRendererStartup,
  runRendererNonCriticalInit,
  scheduleNonCriticalInit
} from './app/startup'
import { installNeteaseServiceApiAuthInvalidation } from '@/app/neteaseServiceApi'
import { ensureVueQueryPlugin } from './app/vueQuery'
import router from './router'
import { setupServices } from './services'
import pinia from './store/pinia'
import { getLogger } from './utils/logger'

const app = createApp(App)

logRendererStartup('entry loaded')

router.beforeResolve(async to => {
  if (!routeRequiresVueQuery(to)) {
    return
  }

  await ensureVueQueryPlugin(app)
})

setupServices()
logRendererStartup('services setup')

app.config.errorHandler = (err: unknown, _vm: unknown, info: string) => {
  getLogger().error('Main', 'Vue Error', { error: err, info })
  captureSentryException(err)
}

installGlobalErrorHandlers()

app.use(pinia)
installNeteaseServiceApiAuthInvalidation(pinia)
app.use(router)

app.mount('#app')
logRendererStartup('app mounted')

scheduleNonCriticalInit(async () => {
  await runRendererNonCriticalInit({
    canLoadRendererSentry,
    initializeSentry
  })
})
