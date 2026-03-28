import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {
  createSharedDevProxy,
  createSrcAlias,
  resolveViteDevServerPort,
  webManualChunks
} from './config/vite.shared.ts'

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sentryDsn = env.SENTRY_DSN ?? ''
  const sentryRelease = env.SENTRY_RELEASE ?? ''
  const isProduction = mode === 'production'
  const devServerPort = resolveViteDevServerPort(env.VITE_DEV_SERVER_PORT)

  const outputDir = isProduction ? 'build' : 'dist'

  const plugins = [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
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

  return {
    plugins,
    base: './',
    define: {
      'import.meta.env.SENTRY_DSN': JSON.stringify(sentryDsn),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease)
    },
    server: {
      port: devServerPort,
      host: '127.0.0.1',
      proxy: createSharedDevProxy({ withQqTimeout: true })
    },
    build: {
      emptyOutDir: true,
      outDir: outputDir,
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: webManualChunks
        }
      }
    },
    resolve: {
      alias: createSrcAlias(process.cwd())
    }
  }
})
