import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const resolveConfig = {
  extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json'],
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@plugin-sdk': fileURLToPath(new URL('../packages/plugin-sdk', import.meta.url)),
    '~': fileURLToPath(new URL('../tests', import.meta.url))
  }
}
const sharedTestOptions = {
  globals: true,
  testTimeout: 10000,
  hookTimeout: 10000
}
const commonProjectExcludes = ['tests/e2e/**']
const nodeProjectIncludes = [
  'tests/api/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/base/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/constants/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/electron/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/plugins/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/services/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/store/player/playbackActions.*.test.ts',
  'tests/utils/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
]
const nodeProjectExcludes = [
  ...commonProjectExcludes,
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
const jsdomProjectIncludes = [
  'tests/App.test.ts',
  'tests/main.test.ts',
  'tests/api/responseHandler.test.ts',
  'tests/components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/composables/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/extensions/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/platform/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/services/apiService.test.ts',
  'tests/services/loggerService.test.ts',
  'tests/services/platformService.test.ts',
  'tests/services/playerService.test.ts',
  'tests/store/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  'tests/utils/electronIpcRequest.test.ts',
  'tests/utils/performanceMonitor.test.ts',
  'tests/utils/player/core/playerCore.test.ts',
  'tests/utils/requestCache.test.ts',
  'tests/utils/requestCanceler.test.ts',
  'tests/utils/sentryRenderer.test.ts',
  'tests/utils/transportFactory.test.ts',
  'tests/views/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
]

export default defineConfig({
  plugins: [vue()],
  root: rootDir,
  resolve: resolveConfig,
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
        resolve: resolveConfig,
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
        resolve: resolveConfig,
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
})
