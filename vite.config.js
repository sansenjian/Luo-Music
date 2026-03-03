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
            onstart: ({ startup }) => startup(),
            // ✅ 配置构建输出目录
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: {
                  output: {
                    entryFileNames: 'main.mjs',
                    format: 'es'  // ES Modules
                  }
                },
                minify: false
              }
            }
          },
          {
            entry: 'electron/preload.js',
            onstart: ({ reload }) => reload(),
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: {
                  output: {
                    entryFileNames: 'preload.js',
                    format: 'iife',
                    exports: 'named'
                  }
                },
                minify: false
              }
            }
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
      emptyOutDir: true,  // ✅ 每次构建前清空输出目录，避免缓存问题
      outDir: 'dist',
      chunkSizeWarningLimit: 500, // 设置警告阈值为 500KB
      rollupOptions: {
        output: {
          // ✅ 精细化的代码分割配置
          manualChunks: {
            // 核心框架
            'vendor-core': ['vue', 'vue-router', 'pinia'],
            // Vue 生态
            'vendor-vue': ['@vueuse/core'],
            // UI 库（按需加载）
            'vendor-ui': ['naive-ui'],
            // 工具库
            'vendor-utils': ['axios', 'animejs']
            // 注意：音乐 API 是 CommonJS，不能在这里引入，需要在代码中动态导入
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
