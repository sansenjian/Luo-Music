import { defineConfig, loadEnv } from 'vite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createSharedDevProxy,
  createSrcAlias,
  createVueRendererPlugins,
  resolveViteDevServerPort,
  webManualChunks
} from '../config/vite.shared.ts'

export default defineConfig(({ command, mode }) => {
  const rootDir = process.cwd()
  const envDir = existsSync(resolve(rootDir, '.config/.env')) ? '.config' : rootDir
  const env = loadEnv(mode, envDir, '')
  const appRuntime = env.APP_RUNTIME === 'electron' ? 'electron' : 'web'
  const sentryDsn = env.SENTRY_DSN ?? ''
  const sentryRelease = env.SENTRY_RELEASE ?? ''
  const sentryTracingEnabled = env.SENTRY_TRACING_ENABLED ?? '0'
  const sentryReplayEnabled = env.SENTRY_REPLAY_ENABLED ?? '0'
  const isBuild = command === 'build'
  const devServerPort = resolveViteDevServerPort(env.VITE_DEV_SERVER_PORT)

  const outputDir = appRuntime === 'electron' ? 'build' : 'dist'

  return {
    plugins: createVueRendererPlugins({ dts: !isBuild }),
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
    build: {
      emptyOutDir: true,
      outDir: outputDir,
      chunkSizeWarningLimit: 500,
      target: 'es2022',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: webManualChunks
        }
      }
    },
    esbuild: {
      drop: isBuild ? ['console', 'debugger'] : []
    },
    resolve: {
      alias: createSrcAlias(process.cwd())
    }
  }
})
