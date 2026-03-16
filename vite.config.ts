import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import type { ManualChunksOption } from 'rollup'

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sentryDsn = env.SENTRY_DSN ?? ''
  const sentryRelease = env.SENTRY_RELEASE ?? ''
  const isWeb = mode === 'web' || process.env.VERCEL === '1'
  const isProduction = mode === 'production'

  // 生产环境统一输出目录
  const outputDir = isProduction ? 'build' : 'dist'

  const plugins = [
    vue(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        'pinia',
        '@vueuse/core'
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: ['src/composables', 'src/store'],
      vueTemplate: true
    }),
    Components({
      dirs: ['src/components'],
      extensions: ['vue'],
      dts: 'src/components.d.ts',
      deep: true
    })
  ]

  // Note: Electron build is handled by electron-vite, not vite-plugin-electron
  // This config is used for Web builds and Vite dev server only

  const manualChunksFn: ManualChunksOption = (id: string) => {
    if (id.includes('node_modules')) {
      if (id.includes('vue') || id.includes('pinia') || id.includes('router')) {
        return 'vendor-core'
      }
      if (id.includes('axios') || id.includes('animejs')) {
        return 'vendor-utils'
      }
      return 'vendor-libs'
    }
    return undefined
  }

  return {
    plugins,
    base: './',
    define: {
      'import.meta.env.SENTRY_DSN': JSON.stringify(sentryDsn),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease)
    },
    server: {
      port: 5173,
      host: 'localhost',
      proxy: {
        '/api': {
          target: 'http://localhost:14532',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, '')
        },
        '/qq-api': {
          target: 'http://localhost:3200',
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/qq-api/, ''),
          // 增加超时配置，避免长时间等待
          proxyTimeout: 15000,
          timeout: 15000
        }
      }
    },
    build: {
      emptyOutDir: true,
      outDir: outputDir,
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: manualChunksFn
        }
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})

