import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

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

  it('keeps Electron dev on the existing Electron-safe Vite path', () => {
    expect(packageJson.scripts?.['dev:electron']).toContain(
      'APP_RUNTIME=electron -- vite --config .config/vite.config.ts'
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

  it('keeps VP lint and format commands as parallel migration entrypoints', () => {
    expect(packageJson.scripts?.['vp:lint']).toBe('npm run vp -- lint -c .oxlintrc.json .')
    expect(packageJson.scripts?.['vp:fmt:check']).toContain(
      'npm run vp -- fmt -c .config/oxfmt.json --check'
    )
  })
})
