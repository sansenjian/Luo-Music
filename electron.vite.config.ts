import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      outDir: 'build/electron',
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'main.cjs'
      },
      rollupOptions: {
        external: [
          'electron',
          'electron-log',
          '@sentry/electron',
          'electron-store',
          'conf',
          '@neteasecloudmusicapienhanced/api',
          '@sansenjian/qq-music-api'
        ],
        output: {
          format: 'cjs',
          exports: 'named',
          strict: false,
          entryFileNames: 'main.cjs'
        }
      },
      commonjsOptions: {
        transformMixedEsModules: false
      },
      minify: false,
      sourcemap: true,
      emptyOutDir: false  // 不清空目录，保留之前的构建产物
    }
  },
  preload: {
    build: {
      outDir: 'build/electron',
      lib: {
        entry: resolve(__dirname, 'electron/sandbox/index.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.cjs'
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          exports: 'named',
          strict: false,
          entryFileNames: 'preload.cjs'
        }
      },
      commonjsOptions: {
        transformMixedEsModules: false
      },
      minify: false,
      sourcemap: true,
      emptyOutDir: false  // 不清空目录
    }
  },
  renderer: {
    root: '.',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:14532',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/qq-api': {
          target: 'http://localhost:3200',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/qq-api/, '')
        }
      }
    },
    optimizeDeps: {
      // 预构建依赖，减少首次启动时间
      include: [
        'vue',
        'pinia',
        '@tanstack/vue-query',
        'naive-ui'
      ],
      exclude: ['electron']
    },
    build: {
      outDir: 'build',
      emptyOutDir: false,  // 不清空目录，保留 Electron 构建产物
      // 代码分割优化
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'pinia', '@tanstack/vue-query'],
            'vendor-naive': ['naive-ui']
          }
        }
      }
    }
  }
})
