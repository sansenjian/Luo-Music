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

export const ANALYZE_EXCLUDE_PLUGIN_MARKER = '__luoAnalyzeExclude'

function markAnalyzeExcludedPlugins(plugins: PluginOption[]): PluginOption[] {
  return plugins.map(plugin => {
    if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
      return plugin
    }

    return Object.assign(plugin, { [ANALYZE_EXCLUDE_PLUGIN_MARKER]: true })
  })
}

const rootDir = __dirname
loadDotEnv({ path: resolve(rootDir, '.env') })
loadDotEnv({ path: resolve(rootDir, '.env.sentry-build-plugin') })
const devServerPort = resolveViteDevServerPort(process.env.VITE_DEV_SERVER_PORT)
const buildSourceMaps = process.env.LUO_BUILD_SOURCEMAP === '1'
const sentryTracingEnabled = process.env.SENTRY_TRACING_ENABLED === '1' ? '1' : '0'
const sentryReplayEnabled = process.env.SENTRY_REPLAY_ENABLED === '1' ? '1' : '0'

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

  rendererPlugins.push(
    ...markAnalyzeExcludedPlugins(Array.isArray(sentryPlugins) ? sentryPlugins : [sentryPlugins])
  )
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
      minify: true,
      sourcemap: buildSourceMaps,
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
      minify: true,
      sourcemap: buildSourceMaps,
      emptyOutDir: false
    }
  },
  renderer: {
    root: '.',
    plugins: rendererPlugins,
    define: {
      'import.meta.env.APP_RUNTIME': JSON.stringify('electron'),
      'import.meta.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease),
      'import.meta.env.SENTRY_TRACING_ENABLED': JSON.stringify(sentryTracingEnabled),
      'import.meta.env.SENTRY_REPLAY_ENABLED': JSON.stringify(sentryReplayEnabled)
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
      minify: true,
      sourcemap: buildSourceMaps,
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
