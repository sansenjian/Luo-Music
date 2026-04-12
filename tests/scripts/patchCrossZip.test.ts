import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { patchAppBuilderLibNodeModulesCollector, patchCrossZip } =
  require('../../scripts/patch-cross-zip.cjs') as {
    patchAppBuilderLibNodeModulesCollector: (filePath: string) => void
    patchCrossZip: (filePath: string) => void
  }

const crossZipOriginalSource = [
  'function doZip () {',
  "  if (process.platform === 'win32') {",
  '    fs.rmdir(outPath, { recursive: true, maxRetries: 3 }, doZip2)',
  '  } else {',
  '    doZip2()',
  '  }',
  '}',
  '',
  'function zipSync (inPath, outPath) {',
  '  if (process.platform === "win32") {',
  '    fs.rmdirSync(outPath, { recursive: true, maxRetries: 3 })',
  '  }',
  '}',
  ''
].join('\n')

const crossZipPatchedSource = [
  'function doZip () {',
  "  if (process.platform === 'win32') {",
  '    fs.rm(outPath, { recursive: true, force: true, maxRetries: 3 }, doZip2)',
  '  } else {',
  '    doZip2()',
  '  }',
  '}',
  '',
  'function zipSync (inPath, outPath) {',
  '  if (process.platform === "win32") {',
  '    fs.rmSync(outPath, { recursive: true, force: true, maxRetries: 3 })',
  '  }',
  '}',
  ''
].join('\n')

const originalSnippet = [
  '        await new Promise((resolve, reject) => {',
  '            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);',
  '            const child = childProcess.spawn(command, args, {',
  '                cwd,',
  '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
  '                shell: true, // `true`` is now required: https://github.com/electron-userland/electron-builder/issues/9488',
  '            });'
].join('\n')

const safeSnippet = [
  '        await new Promise((resolve, reject) => {',
  '            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);',
  '            const child = childProcess.spawn(command, args, {',
  '                cwd,',
  '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
  '                shell: false, // pass argv directly to avoid shell-escaping bugs and injection risks',
  '            });'
].join('\n')

function buildCollectorSource(snippet: string): string {
  return ['async function streamCollectorCommandToFile() {', snippet, '}', ''].join('\n')
}

describe('patch-cross-zip script', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.CI
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITLAB_CI
  })

  it('patches cross-zip to use fs.rm and fs.rmSync on Windows', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'luo-music-patch-cross-zip-'))
    const filePath = join(tempDir, 'index.js')

    try {
      await writeFile(filePath, crossZipOriginalSource, 'utf8')

      patchCrossZip(filePath)

      const patched = await readFile(filePath, 'utf8')
      expect(patched).toContain(
        'fs.rm(outPath, { recursive: true, force: true, maxRetries: 3 }, doZip2)'
      )
      expect(patched).toContain(
        'fs.rmSync(outPath, { recursive: true, force: true, maxRetries: 3 })'
      )
      expect(patched).not.toContain('fs.rmdir(')
      expect(patched).not.toContain('fs.rmdirSync(')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps already-patched cross-zip runs informational in CI', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'luo-music-patch-cross-zip-'))
    const filePath = join(tempDir, 'index.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      process.env.CI = '1'
      await writeFile(filePath, crossZipPatchedSource, 'utf8')

      expect(() => patchCrossZip(filePath)).not.toThrow()
      expect(logSpy).toHaveBeenCalledWith('[patch-cross-zip] cross-zip already patched')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('patches app-builder-lib to spawn with argv directly instead of a shell string', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'luo-music-patch-cross-zip-'))
    const filePath = join(tempDir, 'nodeModulesCollector.js')

    try {
      await writeFile(filePath, buildCollectorSource(originalSnippet), 'utf8')

      patchAppBuilderLibNodeModulesCollector(filePath)

      const patched = await readFile(filePath, 'utf8')
      expect(patched).toContain(safeSnippet)
      expect(patched).not.toContain('quoteForShell')
      expect(patched).not.toContain('shellCommand')
      expect(patched).not.toContain('shell: true')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps local no-op patch runs informational', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'luo-music-patch-cross-zip-'))
    const filePath = join(tempDir, 'nodeModulesCollector.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await writeFile(filePath, buildCollectorSource(safeSnippet), 'utf8')

      expect(() => patchAppBuilderLibNodeModulesCollector(filePath)).not.toThrow()
      expect(logSpy).toHaveBeenCalledWith('[patch-cross-zip] app-builder-lib already patched')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('fails fast in CI when app-builder-lib no longer matches the expected patch source', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'luo-music-patch-cross-zip-'))
    const filePath = join(tempDir, 'nodeModulesCollector.js')

    try {
      process.env.CI = '1'
      await writeFile(filePath, 'async function streamCollectorCommandToFile() {}\n', 'utf8')

      expect(() => patchAppBuilderLibNodeModulesCollector(filePath)).toThrow(
        'app-builder-lib unsupported version'
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
