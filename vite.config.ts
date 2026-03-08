import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig(async ({ mode }) => {
  const isWeb = mode === 'web' || process.env.VERCEL === '1'
  const isElectron = !isWeb

  const plugins: any[] = [
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
          // 主进程入口
          {
            entry: 'electron/main.ts',
            onstart: (args: any) => args.reload(),
            vite: {
              build: {
                outDir: 'dist-electron',
                lib: {
                  entry: 'electron/main.ts',
                  formats: ['cjs'],
                  fileName: () => 'main.cjs'
                },
                rollupOptions: {
                  external: ['electron', 'electron-log', '@sentry/electron', 'electron-store', '@neteasecloudmusicapienhanced/api'],
                  output: {
                    format: 'cjs',
                    exports: 'named',
                    strict: false
                  }
                },
                commonjsOptions: {
                  transformMixedEsModules: false
                },
                minify: false,
                sourcemap: true
              }
            }
          },
          // Preload 脚本
          {
            entry: 'electron/preload.js',
            onstart: (args: any) => args.reload(),
            vite: {
              build: {
                outDir: 'dist-electron',
                lib: {
                  entry: 'electron/preload.js',
                  formats: ['cjs'],
                  fileName: () => 'preload.cjs'
                },
                rollupOptions: {
                  external: ['electron'],
                  output: {
                    format: 'cjs',
                    exports: 'named',
                    strict: false
                  }
                },
                commonjsOptions: {
                  transformMixedEsModules: false
                },
                minify: false,
                sourcemap: true
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
          // @ts-ignore
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
          // @ts-ignore
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('naive-ui')) {
                // Naive UI 是一个完整的库，很难通过文件路径简单拆分
                // 更好的策略是让它独立打包，并接受它较大的事实
                // 或者如果项目只用到了少量组件，检查是否开启了自动按需引入（unplugin-vue-components 已配置）
                // 这里我们尝试将其核心逻辑和组件分开（如果可能），或者直接作为一个大块
                return 'vendor-naive-ui'
              }
              if (id.includes('vue') || id.includes('pinia') || id.includes('router')) {
                return 'vendor-core'
              }
              if (id.includes('axios') || id.includes('animejs')) {
                return 'vendor-utils'
              }
              // 其他依赖打包到 vendor
              return 'vendor-libs'
            }
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

