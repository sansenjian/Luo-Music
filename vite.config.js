import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { fileURLToPath, URL } from 'node:url'

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
          entry: 'electron/preload.js',
          onstart(options) {
            options.reload()
          },
        },
      ]),
      renderer()
    )
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})
