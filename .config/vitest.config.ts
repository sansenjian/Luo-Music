import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

import { createSrcAlias } from '../config/vite.shared.ts'

const sharedTestOptions = {
  globals: true,
  testTimeout: 10000,
  hookTimeout: 10000
}
const testFilePattern = '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
const testDir = (name: string) => `tests/${name}/${testFilePattern}`
const commonProjectExcludes = ['tests/e2e/**']
const nativeTestIncludes = [
  'tests/electron/localLibrary.repository.test.ts',
  'tests/electron/localLibrary.service.test.ts'
]
const includeNativeTests = process.env.LUO_TEST_INCLUDE_NATIVE === '1'
const nativeOnly = process.env.LUO_TEST_NATIVE_ONLY === '1'

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
  ...(nativeOnly
    ? nativeTestIncludes
    : [...nodeRuntimeTestDirs.map(testDir), 'tests/store/player/playbackActions.*.test.ts'])
]
const nodeProjectExcludes = [
  ...commonProjectExcludes,
  ...rendererRuntimeTests,
  ...(includeNativeTests ? [] : nativeTestIncludes)
]
const jsdomProjectIncludes = [
  ...(nativeOnly
    ? []
    : [
        'tests/App.test.ts',
        'tests/main.test.ts',
        ...rendererRuntimeTestDirs.map(testDir),
        ...rendererRuntimeTests
      ])
]

const rootDir = process.cwd()
const testResolve = {
  extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json'],
  alias: {
    ...createSrcAlias(rootDir),
    '@electron/sandbox': resolve(rootDir, 'electron/sandbox'),
    '~': resolve(rootDir, 'tests')
  }
}

export default defineConfig({
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
})
