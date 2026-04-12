import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { cleanTargets, isProjectScopedWindowsProcess, resolveCleanupTargets } =
  require('../../../scripts/build/clean-targets.cjs') as {
    cleanTargets: (targetArgs: string[], options?: { force?: boolean }) => void
    isProjectScopedWindowsProcess: (
      processInfo: {
        Name?: string
        CommandLine?: string
        ExecutablePath?: string
      },
      projectRootPath?: string
    ) => boolean
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

  it('matches only Electron processes that belong to the current project path', () => {
    expect(
      isProjectScopedWindowsProcess(
        {
          Name: 'electron.exe',
          ExecutablePath: join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
        },
        projectRoot
      )
    ).toBe(true)

    expect(
      isProjectScopedWindowsProcess(
        {
          Name: 'electron.exe',
          ExecutablePath: 'C:\\Program Files\\Other App\\electron.exe',
          CommandLine: '"C:\\Program Files\\Other App\\electron.exe" .'
        },
        projectRoot
      )
    ).toBe(false)

    expect(
      isProjectScopedWindowsProcess(
        {
          Name: 'LUO Music.exe',
          ExecutablePath: join(projectRoot, 'out', 'LUO Music-win32-x64', 'LUO Music.exe')
        },
        projectRoot
      )
    ).toBe(true)
  })
})
