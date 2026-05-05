import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

const require = createRequire(import.meta.url)
const {
  createRebuildStamp,
  getNativeBinaryFingerprint,
  isSameStamp,
  parseArgs,
  shouldSkipRebuild
} = require('../../scripts/rebuild-native-electron.cjs') as {
  createRebuildStamp: (input: {
    electronVersion: string
    moduleVersion: string
    nativeBinaryFingerprint?: Record<string, number> | null
  }) => Record<string, string | number>
  getNativeBinaryFingerprint: (modulePath: string) => Record<string, number> | null
  isSameStamp: (left: unknown, right: unknown) => boolean
  parseArgs: (argv: string[]) => { force: boolean }
  shouldSkipRebuild: (input: {
    expectedStamp: Record<string, string | number>
    force: boolean
    modulePath: string
  }) => boolean
}

describe('rebuild-native-electron cache policy', () => {
  const stampPath = join(process.cwd(), '.vite_cache', 'native', 'better-sqlite3-electron.json')
  let tempModulePath: string

  beforeEach(async () => {
    tempModulePath = await mkdtemp(join(tmpdir(), 'luo-native-module-'))
    await mkdir(join(tempModulePath, 'build', 'Release'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempModulePath, { recursive: true, force: true })
    await rm(stampPath, { force: true })
  })

  it('parses the explicit force flag', () => {
    expect(parseArgs([])).toEqual({ force: false })
    expect(parseArgs(['--force'])).toEqual({ force: true })
  })

  it('matches stamps by Electron, module, platform, and arch', () => {
    const stamp = createRebuildStamp({ electronVersion: '40.8.5', moduleVersion: '12.9.0' })

    expect(isSameStamp(stamp, { ...stamp })).toBe(true)
    expect(isSameStamp(stamp, { ...stamp, electronVersion: '41.0.0' })).toBe(false)
  })

  it('skips rebuild only when the native binary and matching stamp both exist', async () => {
    const expectedStamp = createRebuildStamp({
      electronVersion: '40.8.5',
      moduleVersion: '12.9.0'
    })

    expect(
      shouldSkipRebuild({
        expectedStamp,
        force: false,
        modulePath: tempModulePath
      })
    ).toBe(false)

    await writeFile(join(tempModulePath, 'build', 'Release', 'better_sqlite3.node'), '')
    await mkdir(join(process.cwd(), '.vite_cache', 'native'), { recursive: true })
    await writeFile(
      stampPath,
      `${JSON.stringify(
        createRebuildStamp({
          electronVersion: '40.8.5',
          moduleVersion: '12.9.0',
          nativeBinaryFingerprint: getNativeBinaryFingerprint(tempModulePath)
        })
      )}\n`
    )

    expect(existsSync(stampPath)).toBe(true)
    expect(
      shouldSkipRebuild({
        expectedStamp,
        force: false,
        modulePath: tempModulePath
      })
    ).toBe(true)

    await writeFile(join(tempModulePath, 'build', 'Release', 'better_sqlite3.node'), 'changed')
    expect(
      shouldSkipRebuild({
        expectedStamp,
        force: false,
        modulePath: tempModulePath
      })
    ).toBe(false)

    expect(
      shouldSkipRebuild({
        expectedStamp,
        force: true,
        modulePath: tempModulePath
      })
    ).toBe(false)
  })
})
