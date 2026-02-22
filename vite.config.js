import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

export default defineConfig(async ({ mode }) => {
  const isWeb = mode === 'web' || process.env.VERCEL === '1'
  
  const plugins = [vue()]
  
  if (!isWeb) {
    try {
      const electron = (await import('vite-plugin-electron')).default
      const renderer = (await import('vite-plugin-electron-renderer')).default
      
      plugins.push(
        electron([
          {
            entry: 'electron/main.js',
          },
          {
            entry: 'electron/preload.cjs',
            onstart(options) {
              const srcPath = path.resolve('electron/preload.cjs')
              const destPath = path.resolve('dist-electron/preload.cjs')
              if (fs.existsSync(srcPath)) {
                try {
                  fs.mkdirSync(path.dirname(destPath), { recursive: true })
                  fs.copyFileSync(srcPath, destPath)
                } catch (err) {
                  console.warn(`Failed to copy preload.cjs: ${err.message}`)
                }
              }
              options.reload()
            },
          },
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
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify('1.0.0')
    }
  }
})
