import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import naive from 'naive-ui'
import router from './router'
import './assets/main.css'
import './assets/components/index.css'
import App from './App.vue'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

// Vue 全局错误处理
app.config.errorHandler = (err, vm, info) => {
  console.error('Vue Error:', err, info)
  // 可以发送到错误监控服务，如 Sentry
}

// 未处理的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason)
})

// 全局 JS 错误
window.addEventListener('error', (event) => {
  console.error('Global Error:', event.error)
})

app.use(pinia)
app.use(router)
app.use(naive)
app.mount('#app')
