import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type PackageJson = {
  scripts?: Record<string, string>
}

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as PackageJson

describe('package scripts for forge workflows', () => {
  it('runs web dev and preview through the local VP CLI', () => {
    expect(packageJson.scripts?.['dev:server']).toContain(
      'APP_RUNTIME=web -- npm run vp -- --config .config/vite.config.ts --mode web'
    )
    expect(packageJson.scripts?.preview).toContain(
      'APP_RUNTIME=web -- npm run vp -- preview --config .config/vite.config.ts'
    )
  })

  it('runs Electron renderer dev through the local VP CLI', () => {
    expect(packageJson.scripts?.['dev:electron']).toContain(
      'APP_RUNTIME=electron -- npm run vp -- --config .config/vite.config.ts'
    )
  })

  it('runs Electron bundle builds through the local electron-vite CLI', () => {
    expect(packageJson.scripts?.['electron-vite']).toBe(
      'node ./node_modules/electron-vite/bin/electron-vite.js'
    )
    expect(packageJson.scripts?.['electron-vite:build']).toBe(
      'npm run electron-vite -- build --config electron/vite.config.ts'
    )
  })

  it('runs the local service bundle through the local tsdown CLI', () => {
    expect(packageJson.scripts?.tsdown).toBe('node ./node_modules/tsdown/dist/run.mjs')
    expect(packageJson.scripts?.['build:server']).toBe(
      'npm run tsdown -- server/index.ts --no-config --format cjs --out-dir build/service --clean --target node22 --tsconfig tsconfig.node.json --no-report --no-cjs-default'
    )
  })

  it('runs regular tests through Vitest and keeps native tests behind the ABI-safe wrapper', () => {
    expect(packageJson.scripts?.['test:run']).toBe(
      'npm run vitest -- run -c .config/vitest.config.ts'
    )
    expect(packageJson.scripts?.['test:native']).toBe(
      'node scripts/run-with-env.cjs LUO_TEST_INCLUDE_NATIVE=1 LUO_TEST_NATIVE_ONLY=1 -- node scripts/run-vitest-with-native-restore.cjs run -c .config/vitest.config.ts'
    )
    expect(packageJson.scripts?.['test:ci']).toBe('npm run test:run && npm run test:native')
    expect(packageJson.scripts?.['vitest']).toBe('node ./node_modules/vitest/vitest.mjs')
    expect(packageJson.scripts?.['test:changed']).toBe(
      'npm run vitest -- related --run -c .config/vitest.config.ts'
    )
    expect(packageJson.scripts?.['test:coverage']).toBe(
      'npm run vitest -- run -c .config/vitest.config.ts --coverage'
    )
  })

  it.each(['dev:server', 'dev:electron', 'build:web', 'preview'])(
    'does not require an untracked .config/.env file before running %s',
    scriptName => {
      expect(packageJson.scripts?.[scriptName]).not.toContain('--env-file .config/.env')
    }
  )

  it.each([
    ['build', 'node scripts/build/run-target.cjs build'],
    ['build:web', 'node scripts/build/run-target.cjs web'],
    ['build:electron:bundle', 'node scripts/build/run-target.cjs electron-bundle'],
    [
      'build:electron:bundle:no-clean',
      'node scripts/build/run-target.cjs electron-bundle-no-clean'
    ],
    ['build:electron', 'node scripts/build/run-target.cjs electron'],
    ['build:electron:portable', 'node scripts/build/run-target.cjs electron-portable'],
    ['package', 'node scripts/build/run-target.cjs package'],
    ['make', 'node scripts/build/run-target.cjs make'],
    ['make:fast', 'node scripts/build/run-target.cjs make-fast'],
    ['clean', 'node scripts/build/clean.cjs'],
    ['clean:all', 'node scripts/build/clean.cjs --all']
  ])('maps %s to a short script entrypoint', (scriptName, expectedCommand) => {
    expect(packageJson.scripts?.[scriptName]).toBe(expectedCommand)
  })

  it('lets build:electron:fast delegate to make:fast without rebuilding twice', () => {
    expect(packageJson.scripts?.['build:electron:fast']).toBe('npm run make:fast')
  })

  it('lets package:fast delegate to the canonical package workflow', () => {
    expect(packageJson.scripts?.['package:fast']).toBe('npm run package')
  })

  it('lets make:portable delegate to the canonical portable workflow', () => {
    expect(packageJson.scripts?.['make:portable']).toBe('npm run build:electron:portable')
  })

  it('keeps quality commands on Vite+ config-backed entrypoints', () => {
    expect(packageJson.scripts?.['vp:lint']).toBe(
      'npm run vp -- lint --no-error-on-unmatched-pattern .'
    )
    expect(packageJson.scripts?.['vp:fmt:check']).toContain(
      'npm run vp -- fmt --check --no-error-on-unmatched-pattern'
    )
    expect(packageJson.scripts?.['vp:check']).toContain('npm run vp -- check')
    expect(packageJson.scripts?.['lint']).toBe('npm run check:architecture && npm run vp:lint')
    expect(packageJson.scripts?.['format:check']).toBe('npm run vp:fmt:check')
    expect(packageJson.scripts?.['quality']).toBe(
      'npm run typecheck && npm run lint && npm run format:check'
    )
    expect(packageJson.scripts?.['lint:staged']).toBe('npm run vp -- staged')
  })
})
