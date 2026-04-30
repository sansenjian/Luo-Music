import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'luo-test-userdata'))
  }
}))

const VALID_MANIFEST = {
  manifestVersion: 1,
  id: 'com.example.test',
  name: 'Test',
  version: '1.0.0',
  category: 'api',
  platformId: 'test',
  source: 'external',
  runtime: 'external-host',
  entry: { main: 'index.mjs', module: 'esm' as const },
  capabilities: {
    search: true,
    songUrl: false,
    songDetail: false,
    lyric: false,
    playlistDetail: false,
    needsHydration: false,
    supportsLyricFetch: false,
    supportsUrlRefreshOnFailure: false
  }
}

const SECOND_VALID_MANIFEST = {
  ...VALID_MANIFEST,
  id: 'com.example.another',
  name: 'Another',
  version: '2.0.0',
  platformId: 'another'
}

let pluginsRoot: string
let tempRoot: string

async function writePlugin(
  dir: string,
  manifest: Record<string, unknown> = VALID_MANIFEST,
  entryFile: string = 'index.mjs',
  entryContent: string = 'export default {}'
): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')
  await fs.writeFile(path.join(dir, entryFile), entryContent, 'utf-8')
}

describe('PluginInstaller', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const uniqueId = `luo-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    tempRoot = path.join(os.tmpdir(), uniqueId)
    pluginsRoot = path.join(tempRoot, 'plugins', 'external')
    await fs.mkdir(pluginsRoot, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  })

  async function createInstaller(
    overrides: { pluginsRoot?: string } = {}
  ): Promise<import('../../electron/plugins/PluginInstaller').PluginInstaller> {
    const { PluginInstaller } = await import('../../electron/plugins/PluginInstaller')
    return new PluginInstaller({ pluginsRoot: overrides.pluginsRoot ?? pluginsRoot })
  }

  describe('getPluginsRoot', () => {
    it('returns the configured plugins root directory', async () => {
      const installer = await createInstaller()
      expect(installer.getPluginsRoot()).toBe(pluginsRoot)
    })

    it('defaults to userData-based path when no pluginsRoot is provided', async () => {
      const { PluginInstaller } = await import('../../electron/plugins/PluginInstaller')
      const installer = new PluginInstaller()
      const root = installer.getPluginsRoot()
      expect(root).toContain('plugins')
      expect(root).toContain('external')
    })
  })

  describe('installFromPath', () => {
    it('installs a valid plugin directory containing manifest.json and entry file', async () => {
      const sourceDir = path.join(tempRoot, 'source-plugin')
      await writePlugin(sourceDir)

      const installer = await createInstaller()
      const result = await installer.installFromPath(sourceDir)

      expect(result.manifest.id).toBe('com.example.test')
      expect(result.manifest.name).toBe('Test')
      expect(result.manifest.version).toBe('1.0.0')
      expect(result.manifest.category).toBe('api')
      expect(result.installPath).toBe(path.join(pluginsRoot, 'com.example.test', '1.0.0'))
      expect(result.entryPath).toBe(
        path.join(pluginsRoot, 'com.example.test', '1.0.0', 'index.mjs')
      )

      const installedManifest = await fs.readFile(
        path.join(result.installPath, 'manifest.json'),
        'utf-8'
      )
      expect(JSON.parse(installedManifest)).toMatchObject({ id: 'com.example.test' })

      const installedEntry = await fs.readFile(result.entryPath, 'utf-8')
      expect(installedEntry).toBe('export default {}')
    })

    it('installs a valid theme plugin with theme resource contributions', async () => {
      const sourceDir = path.join(tempRoot, 'theme-plugin')
      await writePlugin(sourceDir, {
        ...VALID_MANIFEST,
        id: 'com.example.theme',
        name: 'Theme',
        category: 'theme',
        platformId: 'theme',
        capabilities: {
          search: false,
          songUrl: false,
          songDetail: false,
          lyric: false,
          playlistDetail: false,
          needsHydration: false,
          supportsLyricFetch: false,
          supportsUrlRefreshOnFailure: false
        },
        contributions: {
          themeResources: [
            {
              id: 'com.example.theme.ocean',
              label: 'Ocean',
              renderStyle: 'example.ocean',
              cssVariables: {
                '--accent': '#006d77'
              }
            }
          ]
        }
      })

      const installer = await createInstaller()
      const result = await installer.installFromPath(sourceDir)

      expect(result.manifest.category).toBe('theme')
      expect(result.manifest.contributions?.themeResources).toEqual([
        expect.objectContaining({
          id: 'com.example.theme.ocean',
          label: 'Ocean',
          renderStyle: 'example.ocean'
        })
      ])
    })

    it('installs the bundled Re:Start theme plugin fixture', async () => {
      const sourceDir = path.resolve(process.cwd(), 'plugins', 'third-party', 'restart-theme')

      const installer = await createInstaller()
      const result = await installer.installFromPath(sourceDir)

      expect(result.manifest).toMatchObject({
        id: 'com.luomusic.theme.restart',
        category: 'theme',
        platformId: 'restart-theme'
      })
      expect(result.manifest.contributions?.themeResources).toEqual([
        expect.objectContaining({
          id: 'com.luomusic.theme.restart.orange-white',
          label: 'Re:Start Orange White',
          renderStyle: 'third-party.restart',
          cssVariables: expect.objectContaining({
            '--accent': '#ff5a1f',
            '--ui-card-radius': '18px',
            '--home-search-server-display': 'none',
            '--lyric-active-bg': 'transparent'
          })
        })
      ])
    })

    it('installs when given a path directly to manifest.json', async () => {
      const sourceDir = path.join(tempRoot, 'manifest-plugin')
      await writePlugin(sourceDir)
      const manifestPath = path.join(sourceDir, 'manifest.json')

      const installer = await createInstaller()
      const result = await installer.installFromPath(manifestPath)

      expect(result.manifest.id).toBe('com.example.test')
      expect(result.installPath).toBe(path.join(pluginsRoot, 'com.example.test', '1.0.0'))
      expect(result.entryPath).toBe(
        path.join(pluginsRoot, 'com.example.test', '1.0.0', 'index.mjs')
      )
    })

    it('throws for a non-existent path', async () => {
      const installer = await createInstaller()
      await expect(installer.installFromPath('/non/existent/path/xyz')).rejects.toThrow(
        'Plugin path does not exist'
      )
    })

    it('throws for an invalid manifest', async () => {
      const sourceDir = path.join(tempRoot, 'bad-manifest-plugin')
      await fs.mkdir(sourceDir, { recursive: true })
      await fs.writeFile(
        path.join(sourceDir, 'manifest.json'),
        JSON.stringify({ id: 'missing-fields' }),
        'utf-8'
      )
      await fs.writeFile(path.join(sourceDir, 'index.mjs'), 'export default {}', 'utf-8')

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow('Invalid plugin manifest')
    })

    it('throws when the entry file is missing', async () => {
      const sourceDir = path.join(tempRoot, 'missing-entry-plugin')
      await fs.mkdir(sourceDir, { recursive: true })
      await fs.writeFile(
        path.join(sourceDir, 'manifest.json'),
        JSON.stringify(VALID_MANIFEST),
        'utf-8'
      )

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow(
        'Plugin entry not found: index.mjs'
      )
    })

    it('rejects plugin ids that would escape the plugins root', async () => {
      const sourceDir = path.join(tempRoot, 'unsafe-id-plugin')
      await writePlugin(sourceDir, { ...VALID_MANIFEST, id: '../escape' })

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow(
        'Plugin id must be a safe path segment'
      )
    })

    it('rejects plugin versions that would escape the plugin directory', async () => {
      const sourceDir = path.join(tempRoot, 'unsafe-version-plugin')
      await writePlugin(sourceDir, { ...VALID_MANIFEST, version: '../escape' })

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow(
        'Plugin version must be a safe path segment'
      )
    })

    it('rejects absolute plugin entry paths', async () => {
      const sourceDir = path.join(tempRoot, 'absolute-entry-plugin')
      const outsideEntry = path.join(tempRoot, 'outside.mjs')
      await fs.writeFile(outsideEntry, 'export default {}', 'utf-8')
      await writePlugin(sourceDir, {
        ...VALID_MANIFEST,
        entry: { main: outsideEntry, module: 'esm' }
      })

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow(
        'Plugin entry must be a relative path'
      )
    })

    it('rejects relative plugin entry paths outside the plugin directory', async () => {
      const sourceDir = path.join(tempRoot, 'outside-entry-plugin')
      const outsideEntry = path.join(tempRoot, 'outside-relative.mjs')
      await fs.writeFile(outsideEntry, 'export default {}', 'utf-8')
      await writePlugin(sourceDir, {
        ...VALID_MANIFEST,
        entry: { main: path.relative(sourceDir, outsideEntry), module: 'esm' }
      })

      const installer = await createInstaller()
      await expect(installer.installFromPath(sourceDir)).rejects.toThrow(
        'Plugin entry must stay inside the plugin directory'
      )
    })

    it('throws when given a path to a non-manifest file', async () => {
      const sourceDir = path.join(tempRoot, 'random-file-plugin')
      await fs.mkdir(sourceDir, { recursive: true })
      const randomFile = path.join(sourceDir, 'readme.txt')
      await fs.writeFile(randomFile, 'hello', 'utf-8')

      const installer = await createInstaller()
      await expect(installer.installFromPath(randomFile)).rejects.toThrow(
        'Only plugin directories or manifest.json paths are supported'
      )
    })

    it('overwrites a previously installed plugin with the same id', async () => {
      const sourceDirV1 = path.join(tempRoot, 'plugin-v1')
      await writePlugin(sourceDirV1, VALID_MANIFEST, 'index.mjs', '// v1')

      const sourceDirV2 = path.join(tempRoot, 'plugin-v2')
      const v2Manifest = { ...VALID_MANIFEST, version: '2.0.0' }
      await writePlugin(sourceDirV2, v2Manifest, 'index.mjs', '// v2')

      const installer = await createInstaller()

      const result1 = await installer.installFromPath(sourceDirV1)
      expect(result1.manifest.version).toBe('1.0.0')

      const result2 = await installer.installFromPath(sourceDirV2)
      expect(result2.manifest.version).toBe('2.0.0')

      // installFromPath clears the entire plugin root before copying, so
      // only the newly-installed version directory should remain.
      const v1Dir = path.join(pluginsRoot, 'com.example.test', '1.0.0')
      const v1Exists = await fs.stat(v1Dir).then(
        () => true,
        () => false
      )
      expect(v1Exists).toBe(false)

      const v2Entry = await fs.readFile(result2.entryPath, 'utf-8')
      expect(v2Entry).toBe('// v2')

      const pluginRootContents = await fs.readdir(path.join(pluginsRoot, 'com.example.test'))
      expect(pluginRootContents).toEqual(['2.0.0'])
    })
  })

  describe('uninstall', () => {
    it('removes the plugin directory', async () => {
      const sourceDir = path.join(tempRoot, 'uninstall-plugin')
      await writePlugin(sourceDir)

      const installer = await createInstaller()
      await installer.installFromPath(sourceDir)

      const pluginDir = path.join(pluginsRoot, 'com.example.test')
      const existsBefore = await fs.stat(pluginDir).then(
        () => true,
        () => false
      )
      expect(existsBefore).toBe(true)

      await installer.uninstall('com.example.test')

      const existsAfter = await fs.stat(pluginDir).then(
        () => true,
        () => false
      )
      expect(existsAfter).toBe(false)
    })

    it('does not throw when uninstalling a non-existent plugin', async () => {
      const installer = await createInstaller()
      await expect(installer.uninstall('com.example.nonexistent')).resolves.toBeUndefined()
    })

    it('rejects unsafe plugin ids before uninstalling', async () => {
      const installer = await createInstaller()
      await expect(installer.uninstall('../escape')).rejects.toThrow(
        'Plugin id must be a safe path segment'
      )
    })
  })

  describe('scanInstalledPlugins', () => {
    it('returns installed plugins', async () => {
      const sourceDir1 = path.join(tempRoot, 'scan-plugin-1')
      await writePlugin(sourceDir1, VALID_MANIFEST)

      const sourceDir2 = path.join(tempRoot, 'scan-plugin-2')
      await writePlugin(sourceDir2, SECOND_VALID_MANIFEST)

      const installer = await createInstaller()
      await installer.installFromPath(sourceDir1)
      await installer.installFromPath(sourceDir2)

      const results = await installer.scanInstalledPlugins()

      expect(results).toHaveLength(2)

      const ids = results.map(r => r.manifest.id).sort()
      expect(ids).toEqual(['com.example.another', 'com.example.test'])

      const testPlugin = results.find(r => r.manifest.id === 'com.example.test')!
      expect(testPlugin.manifest.name).toBe('Test')
      expect(testPlugin.installPath).toBe(path.join(pluginsRoot, 'com.example.test', '1.0.0'))
      expect(testPlugin.entryPath).toBe(
        path.join(pluginsRoot, 'com.example.test', '1.0.0', 'index.mjs')
      )
    })

    it('returns an empty array when no plugins are installed', async () => {
      const installer = await createInstaller()
      const results = await installer.scanInstalledPlugins()
      expect(results).toEqual([])
    })

    it('skips directories without valid manifests', async () => {
      const badPluginDir = path.join(pluginsRoot, 'com.example.broken', '1.0.0')
      await fs.mkdir(badPluginDir, { recursive: true })
      await fs.writeFile(
        path.join(badPluginDir, 'manifest.json'),
        JSON.stringify({ invalid: true }),
        'utf-8'
      )

      const emptyPluginDir = path.join(pluginsRoot, 'com.example.empty')
      await fs.mkdir(emptyPluginDir, { recursive: true })

      const goodSourceDir = path.join(tempRoot, 'good-plugin')
      await writePlugin(goodSourceDir, VALID_MANIFEST)
      const installer = await createInstaller()
      await installer.installFromPath(goodSourceDir)

      const results = await installer.scanInstalledPlugins()

      expect(results).toHaveLength(1)
      expect(results[0].manifest.id).toBe('com.example.test')
    })

    it('picks the latest version when multiple versions are installed', async () => {
      const sourceDirV1 = path.join(tempRoot, 'versioned-plugin-v1')
      await writePlugin(sourceDirV1, VALID_MANIFEST, 'index.mjs', '// v1')

      const v2Manifest = { ...VALID_MANIFEST, version: '2.0.0' }
      const sourceDirV2 = path.join(tempRoot, 'versioned-plugin-v2')
      await writePlugin(sourceDirV2, v2Manifest, 'index.mjs', '// v2')

      const installer = await createInstaller()
      await installer.installFromPath(sourceDirV1)
      await installer.installFromPath(sourceDirV2)

      const results = await installer.scanInstalledPlugins()

      expect(results).toHaveLength(1)
      expect(results[0].manifest.version).toBe('2.0.0')
      expect(results[0].installPath).toBe(path.join(pluginsRoot, 'com.example.test', '2.0.0'))
    })

    it('skips non-directory entries in pluginsRoot', async () => {
      const strayFile = path.join(pluginsRoot, 'stray-file.txt')
      await fs.writeFile(strayFile, 'not a plugin', 'utf-8')

      const installer = await createInstaller()
      const results = await installer.scanInstalledPlugins()
      expect(results).toEqual([])
    })
  })
})
