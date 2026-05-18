import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  checkLegacyServiceAccessorImports,
  checkLocalLibraryNativeTestBoundaries,
  checkNeteaseApiRequestImports,
  checkRendererHttpConstants,
  checkTopLevelServiceAccess
} = require('../../scripts/check-architecture-boundaries.cjs') as {
  checkLegacyServiceAccessorImports: (files: string[], errors: string[], rootDir?: string) => void
  checkLocalLibraryNativeTestBoundaries: (
    files: string[],
    errors: string[],
    rootDir?: string
  ) => void
  checkNeteaseApiRequestImports: (files: string[], errors: string[], rootDir?: string) => void
  checkRendererHttpConstants: (errors: string[], rootDir?: string) => void
  checkTopLevelServiceAccess: (files: string[], errors: string[], rootDir?: string) => void
}

describe('architecture boundary checks', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'luo-architecture-boundaries-'))
    await mkdir(join(tempDir, 'tests', 'electron'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'api'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'composables'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'constants'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'store'), { recursive: true })
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

  it('blocks direct Netease request imports in API modules', async () => {
    await writeTestFile('src/api/search.ts', "import request from '@/utils/http'\n")
    await writeTestFile('src/api/album.ts', "import request from '@/utils/http/index'\n")
    await writeTestFile('src/api/song.ts', "import request from '../utils/http'\n")
    await writeTestFile('src/api/netease.ts', "import request from '@/utils/http'\n")
    await writeTestFile('src/api/qqmusic.ts', "import request from '@/utils/http'\n")

    const errors: string[] = []

    checkNeteaseApiRequestImports(
      [
        'src/api/search.ts',
        'src/api/album.ts',
        'src/api/song.ts',
        'src/api/netease.ts',
        'src/api/qqmusic.ts'
      ],
      errors,
      tempDir
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'src/api/search.ts: Netease API modules should use src/api/shared/neteaseServiceRequest.ts'
      ),
      expect.stringContaining(
        'src/api/album.ts: Netease API modules should use src/api/shared/neteaseServiceRequest.ts'
      ),
      expect.stringContaining(
        'src/api/song.ts: Netease API modules should use src/api/shared/neteaseServiceRequest.ts'
      ),
      expect.stringContaining(
        'src/api/netease.ts: Netease API modules should use src/api/shared/neteaseServiceRequest.ts'
      )
    ])
  })

  it('keeps service port defaults out of renderer HTTP constants', async () => {
    await writeTestFile(
      'src/constants/http.ts',
      'export const NETEASE_API_PORT = 14532\nexport const QQ_API_PORT = 3200\n'
    )

    const errors: string[] = []
    checkRendererHttpConstants(errors, tempDir)

    expect(errors).toEqual([
      expect.stringContaining(
        'src/constants/http.ts: service port defaults belong in packages/shared/protocol/cache.ts'
      )
    ])
  })

  it('blocks legacy service accessor imports in production code', async () => {
    await writeTestFile(
      'src/composables/useLegacyPlatform.ts',
      "import { getPlatformAccessor } from '@/services/platformAccessor'\n"
    )
    await writeTestFile(
      'src/store/playerLegacy.ts',
      "import { getPlayerAccessor } from '../services/playerAccessor'\n"
    )

    const errors: string[] = []
    checkLegacyServiceAccessorImports(
      ['src/composables/useLegacyPlatform.ts', 'src/store/playerLegacy.ts'],
      errors,
      tempDir
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'src/composables/useLegacyPlatform.ts: use services.platform()/services.player() instead of legacy accessor'
      ),
      expect.stringContaining(
        'src/store/playerLegacy.ts: use services.platform()/services.player() instead of legacy accessor'
      )
    ])
  })

  it('blocks module-top services access in API, store, and composable modules', async () => {
    await writeTestFile(
      'src/api/example.ts',
      "import { services } from '@/services'\nconst api = services.api()\nexport const config: unknown = services.config()\n"
    )
    await writeTestFile(
      'src/store/exampleStore.ts',
      "import { services } from '@/services'\nexport function createStoreDeps() {\n  const api = services.api()\n  return { api }\n}\n"
    )

    const errors: string[] = []
    checkTopLevelServiceAccess(['src/api/example.ts', 'src/store/exampleStore.ts'], errors, tempDir)

    expect(errors).toEqual([
      expect.stringContaining(
        'src/api/example.ts:2: avoid caching services.xxx() at module top level'
      ),
      expect.stringContaining(
        'src/api/example.ts:3: avoid caching services.xxx() at module top level'
      )
    ])
  })
})
