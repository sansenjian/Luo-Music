import { resolve } from 'node:path'
import type { ManualChunksOption } from 'rollup'

type RewritePath = (path: string) => string

type ProxyEntry = {
  target: string
  changeOrigin: boolean
  rewrite: RewritePath
  secure?: boolean
  proxyTimeout?: number
  timeout?: number
}

export function createSrcAlias(rootDir: string): Record<'@', string> {
  return {
    '@': resolve(rootDir, 'src')
  }
}

export function createSharedDevProxy(options: { withQqTimeout?: boolean } = {}): Record<string, ProxyEntry> {
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

export const webManualChunks: ManualChunksOption = (id: string) => {
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

export const electronRendererManualChunks: ManualChunksOption = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (
    id.includes('/vue/') ||
    id.includes('/@vue/') ||
    id.includes('/pinia/') ||
    id.includes('/vue-router/') ||
    id.includes('/@tanstack/vue-query/')
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
