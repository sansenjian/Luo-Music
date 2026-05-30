import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { checkArtifactBudgets, collectSize, formatBytes, parseArgs, resolveBudgets } =
  require('../../../scripts/build/check-artifact-budgets.cjs') as {
    checkArtifactBudgets: (options?: {
      budgets?: Array<{ path: string; maxBytes: number }>
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
    collectSize: (absolutePath: string) => Promise<number | null>
    formatBytes: (value: number) => string
    parseArgs: (argv: string[]) => { profiles: string[]; strict: boolean }
    resolveBudgets: (profiles: string[]) => Array<{ path: string; maxBytes: number }>
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
