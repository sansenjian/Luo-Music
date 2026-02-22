import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig(async ({ mode }) => {
  const isWeb = mode === 'web' || process.env.VERCEL === '1'
  const isElectron = !isWeb

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

  if (isElectron) {
    try {
      const electron = (await import('vite-plugin-electron')).default
      const renderer = (await import('vite-plugin-electron-renderer')).default

      plugins.push(
        electron([
          {
            entry: 'electron/main.js',
            onstart: ({ startup }) => startup()
          },
          {
            entry: 'electron/preload.cjs',
            onstart: ({ reload }) => reload()
          }
        ]),
        renderer()
      )
    } catch (e) {
      console.log('Electron plugins not available, skipping for web build')
    }
  }

  return {
    plugins,
    base: './',
    server: {
      port: 5173,
      host: 'localhost',
      proxy: {
        '/api': {
          target: 'http://localhost:14532',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    build: {
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia'],
            vueuse: ['@vueuse/core']
          }
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
