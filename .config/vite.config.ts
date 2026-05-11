import { defineConfig, loadEnv } from 'vite-plus'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ConfigEnv, PluginOption, UserConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import {
  createAppRuntimeHtmlMarkerPlugin,
  createSharedDevProxy,
  createSrcAlias,
  createVueRendererPlugins,
  resolveViteDevServerPort,
  webManualChunks
} from '../config/vite.shared.ts'

const sharedTestOptions = {
  globals: true,
  testTimeout: 10000,
  hookTimeout: 10000
}
const testFilePattern = '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
const testDir = (name: string) => `tests/${name}/${testFilePattern}`
const commonProjectExcludes = ['tests/e2e/**']

const rendererRuntimeTests = [
  'tests/api/responseHandler.test.ts',
  'tests/services/apiService.test.ts',
  'tests/services/loggerService.test.ts',
  'tests/services/platformService.test.ts',
  'tests/services/playerService.test.ts',
  'tests/utils/electronIpcRequest.test.ts',
  'tests/utils/performanceMonitor.test.ts',
  'tests/utils/player/core/playerCore.test.ts',
  'tests/utils/requestCache.test.ts',
  'tests/utils/requestCanceler.test.ts',
  'tests/utils/sentryRenderer.test.ts',
  'tests/utils/transportFactory.test.ts'
]

const nodeRuntimeTestDirs = [
  'api',
  'base',
  'constants',
  'electron',
  'plugins',
  'scripts',
  'services',
  'utils'
]
const rendererRuntimeTestDirs = [
  'components',
  'composables',
  'extensions',
  'platform',
  'store',
  'views'
]
const nodeProjectIncludes = [
  ...nodeRuntimeTestDirs.map(testDir),
  'tests/store/player/playbackActions.*.test.ts'
]
const nodeProjectExcludes = [...commonProjectExcludes, ...rendererRuntimeTests]
const jsdomProjectIncludes = [
  'tests/App.test.ts',
  'tests/main.test.ts',
  ...rendererRuntimeTestDirs.map(testDir),
  ...rendererRuntimeTests
]

function createConfig({ command, mode }: ConfigEnv): UserConfig {
  const rootDir = process.cwd()
  const envDir = existsSync(resolve(rootDir, '.config/.env')) ? '.config' : rootDir
  const env = loadEnv(mode, envDir, '')
  const appRuntime = env.APP_RUNTIME === 'electron' ? 'electron' : 'web'
  const sentryDsn = env.SENTRY_DSN ?? ''
  const sentryRelease = env.SENTRY_RELEASE ?? ''
  const sentryTracingEnabled = env.SENTRY_TRACING_ENABLED ?? '0'
  const sentryReplayEnabled = env.SENTRY_REPLAY_ENABLED ?? '0'
  const isBuild = command === 'build'
  const isTest = mode === 'test'
  const devServerPort = resolveViteDevServerPort(env.VITE_DEV_SERVER_PORT)
  const srcAlias = createSrcAlias(rootDir)
  const outputDir = appRuntime === 'electron' ? 'build' : 'dist'
  const testResolve = {
    extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json'],
    alias: {
      ...srcAlias,
      '@electron/sandbox': resolve(rootDir, 'electron/sandbox'),
      '~': resolve(rootDir, 'tests')
    }
  }

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
    ...(isBuild
      ? {
          esbuild: {
            drop: ['console', 'debugger']
          }
        }
      : {}),
    resolve: {
      alias: srcAlias
    },
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        include: ['src/**/*.{ts,vue}'],
        // Coverage is scoped to the renderer. Electron, script, and API tests still run in the node project.
        exclude: [
          'node_modules/',
          'tests/',
          '**/*.config.js',
          '**/dist/**',
          '**/build/**',
          '**/*.d.ts'
        ],
        thresholds: {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60
        }
      },
      projects: [
        {
          plugins: [vue()],
          root: rootDir,
          resolve: testResolve,
          test: {
            ...sharedTestOptions,
            name: 'node',
            environment: 'node',
            setupFiles: ['./tests/setup.node.ts'],
            include: nodeProjectIncludes,
            exclude: nodeProjectExcludes
          }
        },
        {
          plugins: [vue()],
          root: rootDir,
          resolve: testResolve,
          test: {
            ...sharedTestOptions,
            name: 'jsdom',
            environment: 'jsdom',
            setupFiles: ['./tests/setup.jsdom.ts'],
            include: jsdomProjectIncludes,
            exclude: [...commonProjectExcludes, 'tests/store/player/playbackActions.*.test.ts']
          }
        }
      ]
    }
  }

  return config as unknown as UserConfig
}

export default defineConfig(createConfig)
