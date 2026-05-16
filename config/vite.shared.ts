import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import type { PluginOption } from 'vite'

export type AppRuntime = 'web' | 'electron'

type RewritePath = (path: string) => string

type ProxyEntry = {
  target: string
  changeOrigin: boolean
  rewrite: RewritePath
  secure?: boolean
  proxyTimeout?: number
  timeout?: number
}

type VueRendererPluginOptions = {
  dts?: boolean
}

type ManualChunksFunction = (id: string) => string | undefined

export const DEFAULT_VITE_DEV_SERVER_PORT = 5173

export function resolveViteDevServerPort(
  value: string | undefined,
  fallback = DEFAULT_VITE_DEV_SERVER_PORT
): number {
  const parsed = Number.parseInt(value ?? '', 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export function createSrcAlias(rootDir: string): Record<string, string> {
  return {
    '@': resolve(rootDir, 'src'),
    '@plugin-sdk': resolve(rootDir, 'packages/plugin-sdk'),
    '@shared': resolve(rootDir, 'packages/shared')
  }
}

export function createVueRendererPlugins(options: VueRendererPluginOptions = {}): PluginOption[] {
  const dtsEnabled = options.dts ?? true

  return [
    vue() as PluginOption,
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      dts: dtsEnabled ? 'src/auto-imports.d.ts' : false,
      dirs: ['src/composables', 'src/store', 'src/features/*/composables'],
      vueTemplate: true
    }) as PluginOption,
    Components({
      dirs: ['src/components', 'src/features/*/components'],
      extensions: ['vue'],
      dts: dtsEnabled ? 'src/components.d.ts' : false,
      deep: true
    }) as PluginOption
  ]
}

export function createAppRuntimeHtmlMarkerPlugin(runtime: AppRuntime): PluginOption {
  return {
    name: 'luo-app-runtime-html-marker',
    configureServer(server) {
      server.middlewares.use('/__luo-runtime', (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', 'application/json; charset=utf-8')

        if (request.method === 'HEAD') {
          response.end()
          return
        }

        response.end(JSON.stringify({ runtime }))
      })
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            name: 'luo-app-runtime',
            content: runtime
          },
          injectTo: 'head'
        }
      ]
    }
  }
}

export function createSharedDevProxy(
  options: { withQqTimeout?: boolean } = {}
): Record<string, ProxyEntry> {
  const qqProxy: ProxyEntry = {
    target: 'http://localhost:3200',
    changeOrigin: true,
    secure: false,
    rewrite: (path: string) => path.replace(/^\/qq-api/, '')
  }

  if (options.withQqTimeout) {
    qqProxy.proxyTimeout = 15000
    qqProxy.timeout = 15000
  }

  return {
    '/api': {
      target: 'http://localhost:14532',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, '')
    },
    '/qq-api': qqProxy
  }
}

export const webManualChunks: ManualChunksFunction = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (id.includes('@tanstack/')) {
    return 'vendor-query'
  }

  if (id.includes('@vercel/analytics')) {
    return 'vendor-analytics'
  }

  if (id.includes('vue') || id.includes('pinia') || id.includes('router')) {
    return 'vendor-core'
  }

  if (id.includes('pinia-plugin-persistedstate')) {
    return 'vendor-core'
  }

  if (id.includes('axios') || id.includes('animejs')) {
    return 'vendor-utils'
  }

  return 'vendor-libs'
}

export const electronRendererManualChunks: ManualChunksFunction = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (id.includes('/@tanstack/')) {
    return 'vendor-query'
  }

  if (
    id.includes('/vue/') ||
    id.includes('/@vue/') ||
    id.includes('/pinia/') ||
    id.includes('/vue-router/')
  ) {
    return 'vendor-vue'
  }

  if (
    id.includes('/axios/') ||
    id.includes('/animejs/') ||
    id.includes('/zod/') ||
    id.includes('/date-fns/')
  ) {
    return 'vendor-utils'
  }

  return undefined
}
