import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { cleanTargets, resolveCleanupTargets } =
  require('../../../scripts/build/clean-targets.cjs') as {
    cleanTargets: (targetArgs: string[], options?: { force?: boolean }) => void
    resolveCleanupTargets: (
      targetArgs: string[]
    ) => Array<{ targetPath: string; absolutePath: string }>
  }

const projectRoot = resolve(process.cwd())

describe('clean-targets script', () => {
  it('refuses to resolve paths outside the project root', () => {
    expect(() => resolveCleanupTargets(['..'])).toThrow('outside project root')
  })

  it('cleans only the requested targets', async () => {
    const cacheRoot = join(projectRoot, '.vite_cache')
    await mkdir(cacheRoot, { recursive: true })
    const projectScopedRoot = await mkdtemp(join(cacheRoot, 'luo-music-clean-targets-'))
    const portableDir = join(projectScopedRoot, 'portable')
    const makeDir = join(projectScopedRoot, 'make')

    try {
      await Promise.all([
        mkdir(portableDir, { recursive: true }),
        mkdir(makeDir, { recursive: true })
      ])
      await Promise.all([
        writeFile(join(portableDir, 'portable.exe'), 'portable'),
        writeFile(join(makeDir, 'setup.exe'), 'setup')
      ])

      cleanTargets([relative(projectRoot, portableDir).replaceAll('\\', '/')], { force: false })

      await expect(stat(portableDir)).rejects.toBeDefined()
      await expect(stat(makeDir)).resolves.toBeDefined()
    } finally {
      await rm(projectScopedRoot, { recursive: true, force: true })
    }
  })
})
