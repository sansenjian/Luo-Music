import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const isWeb = mode === 'web' || process.env.VERCEL === '1'
  
  const plugins = [vue()]
  
  if (!isWeb) {
    plugins.push(
      electron([
        {
          entry: 'electron/main.js',
        },
        {
          entry: 'electron/preload.cjs',
          onstart(options) {
            // Copy the original preload.cjs to dist-electron without transformation
            const srcPath = path.resolve('electron/preload.cjs')
            const destPath = path.resolve('dist-electron/preload.cjs')
            if (fs.existsSync(srcPath)) {
              try {
                // Ensure the destination directory exists
                fs.mkdirSync(path.dirname(destPath), { recursive: true })
                fs.copyFileSync(srcPath, destPath)
              } catch (err) {
                console.warn(`Failed to copy preload.cjs: ${err.message}`)
                console.warn(`  src: ${srcPath}`)
                console.warn(`  dest: ${destPath}`)
              }
            } else {
              console.warn(`preload.cjs not found at ${srcPath}`)
              console.warn(`  Expected for dist-electron: ${destPath}`)
            }
            options.reload()
          },
        },
      ]),
      renderer()
    )
  }

  return {
    plugins,
    base: './', // 相对路径，适配 Vercel
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:14532',
          changeOrigin: true,
          rewrite: (reqPath) => reqPath.replace(/^\/api/, '')
        }
      }
    },
    build: {
      outDir: isWeb ? 'dist' : 'dist-electron',
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
      __IS_WEB__: isWeb,
      __API_BASE__: JSON.stringify(process.env.VITE_API_BASE_URL || '/api')
    }
  }
})
