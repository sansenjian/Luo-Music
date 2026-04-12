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
  it('cleans only web outputs before build:web', () => {
    expect(packageJson.scripts?.['build:web']).toBe(
      'node scripts/build/clean-targets.cjs dist build/service && npm run guard:configs && npm run build:server && node scripts/run-with-env.cjs APP_RUNTIME=web -- vite build --mode web'
    )
  })

  it('cleans only the packaged app directory before package', () => {
    expect(packageJson.scripts?.package).toBe(
      'node scripts/build/clean-targets.cjs --force build "out/LUO Music-win32-x64" && npm run build:electron:bundle && electron-forge package'
    )
  })

  it.each(['build:electron', 'make', 'make:fast'])(
    'cleans only forge make outputs before %s',
    scriptName => {
      expect(packageJson.scripts?.[scriptName]).toMatch(
        /^node scripts\/build\/clean-targets\.cjs --force build "out\/LUO Music-win32-x64" out\/make && npm run build:electron:bundle && /
      )
    }
  )

  it('runs build:electron:bundle before the portable single-exe workflow', () => {
    expect(packageJson.scripts?.['build:electron:portable']).toBe(
      'node scripts/build/clean-targets.cjs --force build out/portable && npm run build:electron:bundle && electron-builder --config electron-builder.portable.json --publish never && node scripts/build/finalize-portable-output.cjs out/portable'
    )
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
})
