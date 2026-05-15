import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { checkLocalLibraryNativeTestBoundaries } =
  require('../../scripts/check-architecture-boundaries.cjs') as {
    checkLocalLibraryNativeTestBoundaries: (
      files: string[],
      errors: string[],
      rootDir?: string
    ) => void
  }

describe('architecture boundary checks', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'luo-architecture-boundaries-'))
    await mkdir(join(tempDir, 'tests', 'electron'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  async function writeTestFile(file: string, source: string) {
    await writeFile(join(tempDir, file), source, 'utf8')
  }

  it('keeps native repository imports limited to the dedicated native local-library tests', async () => {
    const allowedNativeTest = 'tests/electron/localLibrary.repository.test.ts'
    const pureTest = 'tests/electron/localLibrary.scanEngine.test.ts'
    await writeTestFile(
      allowedNativeTest,
      "import { LocalLibraryRepository } from '../../electron/local-library/repository'\n"
    )
    await writeTestFile(
      pureTest,
      "import { createTrackId } from '../../electron/local-library/repository'\n"
    )

    const errors: string[] = []
    checkLocalLibraryNativeTestBoundaries([allowedNativeTest, pureTest], errors, tempDir)

    expect(errors).toEqual([
      expect.stringContaining(
        `${pureTest}: pure local-library tests must not import native SQLite boundary`
      )
    ])
  })

  it('blocks direct native SQLite runtime imports in pure local-library tests', async () => {
    const pureTest = 'tests/electron/localLibrary.handler.test.ts'
    await writeTestFile(pureTest, "import Database from 'better-sqlite3'\n")

    const errors: string[] = []
    checkLocalLibraryNativeTestBoundaries([pureTest], errors, tempDir)

    expect(errors).toEqual([
      expect.stringContaining(
        `${pureTest}: pure local-library tests must not import native SQLite boundary`
      )
    ])
  })
})
