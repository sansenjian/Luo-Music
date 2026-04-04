import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'
import { config as loadDotEnv } from 'dotenv'
import type { PluginOption } from 'vite'
import {
  createSharedDevProxy,
  createSrcAlias,
  electronRendererManualChunks,
  resolveViteDevServerPort
} from './config/vite.shared.ts'
const rootDir = __dirname
loadDotEnv({ path: resolve(rootDir, '.env') })
loadDotEnv({ path: resolve(rootDir, '.env.sentry-build-plugin') })
const devServerPort = resolveViteDevServerPort(process.env.VITE_DEV_SERVER_PORT)

const sentryRelease =
  process.env.SENTRY_RELEASE || `luo-music@${process.env.npm_package_version ?? '0.0.0'}`
const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
)

const rendererPlugins: PluginOption[] = [vue()]
if (sentryUploadEnabled) {
  const sentryPlugins = sentryVitePlugin({
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: {
      name: sentryRelease,
      inject: true
    },
    sourcemaps: {
      assets: ['build/**'],
      ignore: ['node_modules']
    },
    telemetry: false
  })

  rendererPlugins.push(...(Array.isArray(sentryPlugins) ? sentryPlugins : [sentryPlugins]))
}

export default defineConfig({
  main: {
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      alias: createSrcAlias(__dirname)
    },
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
      emptyOutDir: false
    }
  },
  preload: {
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      alias: createSrcAlias(__dirname)
    },
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
      emptyOutDir: false
    }
  },
  renderer: {
    root: '.',
    plugins: rendererPlugins,
    define: {
      'import.meta.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease)
    },
    resolve: {
      alias: createSrcAlias(__dirname)
    },
    server: {
      port: devServerPort,
      host: '127.0.0.1',
      proxy: createSharedDevProxy()
    },
    optimizeDeps: {
      include: ['vue', 'pinia', '@tanstack/vue-query', 'animejs'],
      exclude: ['electron']
    },
    build: {
      outDir: 'build',
      emptyOutDir: false,
      sourcemap: true,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: electronRendererManualChunks
        }
      }
    }
  }
})
