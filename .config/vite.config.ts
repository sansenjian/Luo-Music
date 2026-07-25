import { defineConfig, loadEnv } from 'vite-plus'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ConfigEnv, PluginOption, UserConfig } from 'vite-plus'
import {
  createAppRuntimeHtmlMarkerPlugin,
  createSharedDevProxy,
  createSrcAlias,
  createVueRendererPlugins,
  resolveViteDevServerPort,
  webManualChunks
} from '../config/vite.shared.ts'

function createConfig({ command, mode }: ConfigEnv): UserConfig {
  const rootDir = process.cwd()
  const envDir = existsSync(resolve(rootDir, '.config/.env')) ? '.config' : rootDir
  const env = loadEnv(mode, envDir, '')
  const appRuntime =
    (process.env.APP_RUNTIME ?? env.APP_RUNTIME) === 'electron' ? 'electron' : 'web'
  const sentryDsn = env.SENTRY_DSN ?? ''
  const sentryRelease = env.SENTRY_RELEASE ?? ''
  const sentryTracingEnabled = env.SENTRY_TRACING_ENABLED ?? '0'
  const sentryReplayEnabled = env.SENTRY_REPLAY_ENABLED ?? '0'
  const isBuild = command === 'build'
  const isTest = mode === 'test'
  const devServerPort = resolveViteDevServerPort(env.VITE_DEV_SERVER_PORT)
  const srcAlias = createSrcAlias(rootDir)
  const outputDir = appRuntime === 'electron' ? 'build' : 'dist'

  const config = {
    plugins: [
      ...createVueRendererPlugins({ dts: !isBuild && !isTest }),
      createAppRuntimeHtmlMarkerPlugin(appRuntime)
    ] as PluginOption[],
    base: './',
    define: {
      'import.meta.env.APP_RUNTIME': JSON.stringify(appRuntime),
      'import.meta.env.SENTRY_DSN': JSON.stringify(sentryDsn),
      'import.meta.env.SENTRY_RELEASE': JSON.stringify(sentryRelease),
      'import.meta.env.SENTRY_TRACING_ENABLED': JSON.stringify(sentryTracingEnabled),
      'import.meta.env.SENTRY_REPLAY_ENABLED': JSON.stringify(sentryReplayEnabled)
    },
    server: {
      port: devServerPort,
      host: '127.0.0.1',
      proxy: createSharedDevProxy({ withQqTimeout: true })
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: [
        'vue',
        'vue-router',
        'pinia',
        'pinia-plugin-persistedstate',
        '@tanstack/vue-query',
        'axios',
        'animejs',
        '@vueuse/core',
        'reka-ui',
        'zod',
        'tailwind-merge',
        'clsx',
        'class-variance-authority',
        'lru-cache',
        'web-vitals'
      ],
      exclude: ['electron']
    },
    build: {
      emptyOutDir: true,
      outDir: outputDir,
      chunkSizeWarningLimit: 500,
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: webManualChunks
        }
      }
    },
    ...(isBuild
      ? {
          esbuild: {
            drop: ['console', 'debugger']
          }
        }
      : {}),
    resolve: {
      alias: srcAlias
    }
  }

  return config as unknown as UserConfig
}

export default defineConfig(createConfig)
