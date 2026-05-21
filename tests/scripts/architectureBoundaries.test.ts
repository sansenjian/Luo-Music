import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  checkLegacyServiceAccessorImports,
  checkLocalLibraryNativeTestBoundaries,
  checkNeteaseApiRequestImports,
  checkPlatformDisplayClassHardcoding,
  checkDirectLocalStorageUsage,
  checkPluginAuthFacadeUsage,
  checkRendererHttpConstants,
  checkTopLevelServiceAccess
} = require('../../scripts/check-architecture-boundaries.cjs') as {
  checkDirectLocalStorageUsage: (files: string[], errors: string[], rootDir?: string) => void
  checkLegacyServiceAccessorImports: (files: string[], errors: string[], rootDir?: string) => void
  checkLocalLibraryNativeTestBoundaries: (
    files: string[],
    errors: string[],
    rootDir?: string
  ) => void
  checkNeteaseApiRequestImports: (files: string[], errors: string[], rootDir?: string) => void
  checkPlatformDisplayClassHardcoding: (files: string[], errors: string[], rootDir?: string) => void
  checkPluginAuthFacadeUsage: (files: string[], errors: string[], rootDir?: string) => void
  checkRendererHttpConstants: (errors: string[], rootDir?: string) => void
  checkTopLevelServiceAccess: (files: string[], errors: string[], rootDir?: string) => void
}

describe('architecture boundary checks', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'luo-architecture-boundaries-'))
    await mkdir(join(tempDir, 'tests', 'electron'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'api'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'components'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'composables'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'constants'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'platform', 'web'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'services'), { recursive: true })
    await mkdir(join(tempDir, 'src', 'store'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  async function writeTestFile(file: string, source: string) {
    await mkdir(dirname(join(tempDir, file)), { recursive: true })
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

  it('blocks platform-specific badge classes in production display code', async () => {
    await writeTestFile(
      'src/components/PlatformBadge.vue',
      '<template><span class="service-badge service-badge-qq">QQ</span></template>\n'
    )

    const errors: string[] = []
    checkPlatformDisplayClassHardcoding(['src/components/PlatformBadge.vue'], errors, tempDir)

    expect(errors).toEqual([
      expect.stringContaining('src/components/PlatformBadge.vue:1: use getPlatformDisplayInfo()')
    ])
  })

  it('blocks direct plugin auth call strings outside the plugin service facade', async () => {
    await writeTestFile(
      'src/components/PluginLogin.vue',
      "const state = await pluginService.call(platformId, 'auth.pollLogin', { challengeId })\n"
    )
    await writeTestFile(
      'src/services/pluginService.ts',
      "const state = await bridge.call(platformId, 'auth.pollLogin', { challengeId })\n"
    )

    const errors: string[] = []
    checkPluginAuthFacadeUsage(
      ['src/components/PluginLogin.vue', 'src/services/pluginService.ts'],
      errors,
      tempDir
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'src/components/PluginLogin.vue:1: use services.plugins().auth/account/library methods'
      )
    ])
  })

  it('blocks direct plugin account and library call strings outside the plugin service facade', async () => {
    await writeTestFile(
      'src/components/UserLibrary.vue',
      [
        "await pluginService.call(platformId, 'account.getProfile', {})",
        "await pluginService.call(platformId, 'library.getLikedSongs', {})"
      ].join('\n')
    )
    await writeTestFile(
      'src/services/pluginService.ts',
      "await bridge.call(platformId, 'library.getLikedSongs', {})\n"
    )

    const errors: string[] = []
    checkPluginAuthFacadeUsage(
      ['src/components/UserLibrary.vue', 'src/services/pluginService.ts'],
      errors,
      tempDir
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'src/components/UserLibrary.vue:1: use services.plugins().auth/account/library methods'
      ),
      expect.stringContaining(
        'src/components/UserLibrary.vue:2: use services.plugins().auth/account/library methods'
      )
    ])
  })

  it('keeps direct localStorage access inside platform and storage boundaries', async () => {
    await writeTestFile('src/components/LegacyToggle.vue', 'localStorage.setItem("x", "1")\n')
    await writeTestFile(
      'src/composables/useLegacyFlag.ts',
      'const value = window.localStorage.getItem("x")\n'
    )
    await writeTestFile(
      'src/platform/web/webPlatformService.ts',
      'const value = localStorage.getItem("x")\n'
    )
    await writeTestFile(
      'src/services/storageService.ts',
      'export const storage = window.localStorage\n'
    )
    await writeTestFile(
      'src/utils/storage/migration.ts',
      'const value = localStorage.getItem("x")\n'
    )

    const errors: string[] = []
    checkDirectLocalStorageUsage(
      [
        'src/components/LegacyToggle.vue',
        'src/composables/useLegacyFlag.ts',
        'src/platform/web/webPlatformService.ts',
        'src/services/storageService.ts',
        'src/utils/storage/migration.ts'
      ],
      errors,
      tempDir
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'src/components/LegacyToggle.vue:1: use services.storage() or a platform/storage boundary'
      ),
      expect.stringContaining(
        'src/composables/useLegacyFlag.ts:1: use services.storage() or a platform/storage boundary'
      )
    ])
  })
})
