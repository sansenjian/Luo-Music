import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  checkArtifactBudgets,
  collectFileSizes,
  collectSize,
  formatBytes,
  parseArgs,
  resolveBudgets
} = require('../../../scripts/build/check-artifact-budgets.cjs') as {
  checkArtifactBudgets: (options?: {
    budgets?: Array<{ path: string; maxBytes: number; perFile?: boolean }>
    profiles?: string[]
    rootDir?: string
    strict?: boolean
  }) => Promise<
    Array<{
      exists: boolean
      maxBytes: number
      path: string
      size: number
      withinBudget: boolean
    }>
  >
  collectFileSizes: (
    absolutePath: string,
    displayPath: string
  ) => Promise<Array<{ path: string; size: number }> | null>
  collectSize: (absolutePath: string) => Promise<number | null>
  formatBytes: (value: number) => string
  parseArgs: (argv: string[]) => { profiles: string[]; strict: boolean }
  resolveBudgets: (profiles: string[]) => Array<{
    path: string
    maxBytes: number
    perFile?: boolean
  }>
}

describe('check-artifact-budgets script', () => {
  it('parses budget profiles and strict mode', () => {
    expect(parseArgs(['--profile', 'bundle', '--profile', 'portable', '--strict'])).toEqual({
      profiles: ['bundle', 'portable'],
      strict: true
    })
  })

  it('deduplicates budget paths across profiles', () => {
    const paths = resolveBudgets(['bundle', 'bundle']).map(budget => budget.path)

    expect(paths).toEqual([...new Set(paths)])
    expect(paths).toContain('build')
  })

  it('uses realistic Electron package budgets', () => {
    expect(resolveBudgets(['electron'])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'out/LUO Music-win32-x64',
          maxBytes: 450 * 1024 * 1024
        }),
        expect.objectContaining({
          path: 'out/make',
          maxBytes: 180 * 1024 * 1024,
          perFile: true
        })
      ])
    )
  })

  it('collects nested artifact sizes', async () => {
    const tempRoot = join(tmpdir(), `luo-music-artifact-budget-${process.pid}`)

    try {
      await mkdir(join(tempRoot, 'nested'), { recursive: true })
      await writeFile(join(tempRoot, 'one.bin'), Buffer.alloc(512))
      await writeFile(join(tempRoot, 'nested', 'two.bin'), Buffer.alloc(256))

      expect(await collectSize(tempRoot)).toBe(768)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('collects individual file sizes for per-file artifact budgets', async () => {
    const tempRoot = join(tmpdir(), `luo-music-artifact-file-budget-${process.pid}`)

    try {
      await mkdir(join(tempRoot, 'out', 'make', 'zip'), { recursive: true })
      await mkdir(join(tempRoot, 'out', 'make', 'squirrel'), { recursive: true })
      await writeFile(join(tempRoot, 'out', 'make', 'zip', 'app.zip'), Buffer.alloc(512))
      await writeFile(join(tempRoot, 'out', 'make', 'squirrel', 'setup.exe'), Buffer.alloc(256))

      expect(await collectFileSizes(join(tempRoot, 'out', 'make'), 'out/make')).toEqual(
        expect.arrayContaining([
          { path: 'out/make/zip/app.zip', size: 512 },
          { path: 'out/make/squirrel/setup.exe', size: 256 }
        ])
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('checks per-file artifact budgets without summing sibling installers', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tempRoot = join(tmpdir(), `luo-music-per-file-budget-${process.pid}`)

    try {
      await mkdir(join(tempRoot, 'out', 'make'), { recursive: true })
      await writeFile(join(tempRoot, 'out', 'make', 'one.zip'), Buffer.alloc(900))
      await writeFile(join(tempRoot, 'out', 'make', 'two.exe'), Buffer.alloc(900))

      const results = await checkArtifactBudgets({
        budgets: [{ path: 'out/make', maxBytes: 1024, perFile: true }],
        rootDir: tempRoot,
        strict: true
      })

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'out/make/one.zip',
            size: 900,
            withinBudget: true
          }),
          expect.objectContaining({
            path: 'out/make/two.exe',
            size: 900,
            withinBudget: true
          })
        ])
      )
    } finally {
      consoleLogSpy.mockRestore()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('warns for missing artifacts without failing non-strict packaging checks', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tempRoot = join(tmpdir(), `luo-music-missing-artifact-budget-${process.pid}`)

    try {
      const results = await checkArtifactBudgets({
        budgets: [{ path: 'missing-output', maxBytes: 1024 }],
        rootDir: tempRoot,
        strict: false
      })

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'missing-output',
            exists: false,
            withinBudget: false
          })
        ])
      )
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it('formats byte sizes for build log output', () => {
    expect(formatBytes(512)).toBe('0.5 KiB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MiB')
  })

  it('rejects unknown budget profiles', async () => {
    await expect(checkArtifactBudgets({ profiles: ['unknown'], strict: true })).rejects.toThrow(
      'Unknown artifact budget profile'
    )
  })

  it('fails strict checks when an expected artifact is missing', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tempRoot = join(tmpdir(), `luo-music-strict-missing-artifact-budget-${process.pid}`)

    try {
      await expect(
        checkArtifactBudgets({
          budgets: [{ path: 'missing-output', maxBytes: 1024 }],
          rootDir: tempRoot,
          strict: true
        })
      ).rejects.toThrow('Artifact budget exceeded')
    } finally {
      consoleLogSpy.mockRestore()
    }
  })
})
