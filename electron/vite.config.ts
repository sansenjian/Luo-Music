import { defineConfig } from 'electron-vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotEnv } from 'dotenv'
import type { PluginOption } from 'vite'
import {
  createAppRuntimeHtmlMarkerPlugin,
  createSharedDevProxy,
  createSrcAlias,
  createVueRendererPlugins,
  electronRendererManualChunks,
  resolveViteDevServerPort
} from '../config/vite.shared.ts'

export const ANALYZE_EXCLUDE_PLUGIN_MARKER = '__luoAnalyzeExclude'

function markAnalyzeExcludedPlugins(plugins: PluginOption[]): PluginOption[] {
  return plugins.map(plugin => {
    if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
      return plugin
    }

    return Object.assign(plugin, { [ANALYZE_EXCLUDE_PLUGIN_MARKER]: true })
  })
}

function copyExternalPluginWorkerPlugin(): PluginOption {
  const sourcePath = resolve(rootDir, 'electron/plugins/externalPluginWorker.mjs')
  const outputPath = resolve(rootDir, 'build/electron/externalPluginWorker.mjs')

  return {
    name: 'luo-copy-external-plugin-worker',
    apply: 'build',
    closeBundle() {
      mkdirSync(dirname(outputPath), { recursive: true })
      copyFileSync(sourcePath, outputPath)
    }
  }
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeEnvPath = resolve(rootDir, '.config/.env')
const sentryEnvPath = resolve(rootDir, 'config/.env.sentry')

if (existsSync(runtimeEnvPath)) {
  loadDotEnv({ path: runtimeEnvPath })
}

if (existsSync(sentryEnvPath)) {
  loadDotEnv({ path: sentryEnvPath })
}
const devServerPort = resolveViteDevServerPort(process.env.VITE_DEV_SERVER_PORT)
const sentryUploadRequested = process.env.LUO_SENTRY_UPLOAD === '1'
const buildSourceMaps = process.env.LUO_BUILD_SOURCEMAP === '1' || sentryUploadRequested
const sentryTracingEnabled = process.env.SENTRY_TRACING_ENABLED === '1' ? '1' : '0'
const sentryReplayEnabled = process.env.SENTRY_REPLAY_ENABLED === '1' ? '1' : '0'

const sentryRelease =
  process.env.SENTRY_RELEASE || `luo-music@${process.env.npm_package_version ?? '0.0.0'}`
const sentryUploadEnabled = Boolean(
  sentryUploadRequested &&
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
)
const mainBundledDependencies = [
  'electron-log',
  '@sentry/electron',
  'electron-store',
  'conf',
  'kysely',
  '@neteasecloudmusicapienhanced/api',
  '@sansenjian/qq-music-api'
]

const rendererPlugins: PluginOption[] = [
  ...createVueRendererPlugins({ dts: false }),
  createAppRuntimeHtmlMarkerPlugin('electron')
]
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
    root: rootDir,
    plugins: [copyExternalPluginWorkerPlugin()],
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      alias: createSrcAlias(rootDir),
      noExternal: mainBundledDependencies
    },
    build: {
      externalizeDeps: false,
      outDir: 'build/electron',
      lib: {
        entry: resolve(rootDir, 'electron/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'main.cjs'
      },
      rollupOptions: {
        external: ['electron', 'better-sqlite3'],
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
    root: rootDir,
    resolve: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
      alias: createSrcAlias(rootDir)
    },
    build: {
      outDir: 'build/electron',
      lib: {
        entry: resolve(rootDir, 'electron/sandbox/index.ts'),
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
    root: rootDir,
    plugins: rendererPlugins,
    define: {
      'import.meta.env.APP_RUNTIME': JSON.stringify('electron'),
      'import.meta.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease),
      'import.meta.env.SENTRY_TRACING_ENABLED': JSON.stringify(sentryTracingEnabled),
      'import.meta.env.SENTRY_REPLAY_ENABLED': JSON.stringify(sentryReplayEnabled)
    },
    resolve: {
      alias: createSrcAlias(rootDir)
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
          main: resolve(rootDir, 'index.html')
        },
        output: {
          manualChunks: electronRendererManualChunks
        }
      }
    }
  }
})
