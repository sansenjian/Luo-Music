import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const fsPromises = require('node:fs/promises') as typeof import('node:fs/promises')
const {
  CACHE_FILE_NAME,
  DEFAULT_ZIP_ENTRY_DATE,
  createZipFromDirectory,
  packageThirdPartyPlugins,
  parseArgs,
  resolveArchiveName
} = require('../../../scripts/build/package-third-party-plugins.cjs') as {
  CACHE_FILE_NAME: string
  DEFAULT_ZIP_ENTRY_DATE: Date
  createZipFromDirectory: (sourceDir: string, archivePath: string) => Promise<void>
  packageThirdPartyPlugins: (options: {
    sourceDir: string
    outputDir: string
  }) => Promise<Array<{ id: string; platformId: string; version: string; archivePath: string }>>
  parseArgs: (argv: string[]) => { sourceDir: string; outputDir: string }
  resolveArchiveName: (pluginDirectoryName: string, manifest: Record<string, unknown>) => string
}
const extractZip = require('extract-zip') as (
  archivePath: string,
  options: { dir: string }
) => Promise<void>

const capabilities = {
  search: true,
  songUrl: false,
  songDetail: false,
  lyric: false,
  playlistDetail: false,
  needsHydration: false,
  supportsLyricFetch: false,
  supportsUrlRefreshOnFailure: false
}

async function createOutputDir(prefix: string): Promise<string> {
  await mkdir(join(process.cwd(), 'out'), { recursive: true })
  return mkdtemp(join(process.cwd(), 'out', prefix))
}

async function writePlugin(
  pluginDir: string,
  manifest: Record<string, unknown>,
  entryContent = 'export default {}'
): Promise<void> {
  await mkdir(pluginDir, { recursive: true })
  await writeFile(join(pluginDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')
  await writeFile(join(pluginDir, 'index.mjs'), entryContent, 'utf-8')
}

function createManifest(input: {
  id: string
  name: string
  version: string
  platformId: string
}): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id: input.id,
    name: input.name,
    version: input.version,
    platformId: input.platformId,
    source: 'external',
    runtime: 'external-host',
    entry: { main: 'index.mjs', module: 'esm' },
    capabilities
  }
}

describe('package-third-party-plugins script', () => {
  it('uses a fixed zip entry timestamp for reproducible archives', () => {
    expect(DEFAULT_ZIP_ENTRY_DATE.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('parses custom source and output directories', () => {
    expect(parseArgs(['--source-dir', 'custom/plugins', '--out-dir', 'custom/out'])).toEqual({
      sourceDir: 'custom/plugins',
      outputDir: 'custom/out'
    })
  })

  it('builds archive names from platform id and version', () => {
    expect(
      resolveArchiveName('plugin-dir', {
        id: 'com.example.plugin',
        platformId: 'example plugin',
        version: '1.0.0'
      })
    ).toBe('example-plugin-1.0.0.zip')
  })

  it('packages third-party plugin directories into zip archives under the output directory', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-plugin-packages-'))
    const sourceDir = join(tempRoot, 'plugins', 'third-party')
    const outputDir = await createOutputDir('luo-music-plugin-packages-')

    try {
      await writePlugin(
        join(sourceDir, 'alpha'),
        createManifest({
          id: 'com.example.alpha',
          name: 'Alpha',
          version: '1.0.0',
          platformId: 'alpha'
        })
      )
      await writePlugin(
        join(sourceDir, 'theme-pack'),
        createManifest({
          id: 'com.example.theme',
          name: 'Theme',
          version: '2.1.0',
          platformId: 'theme-pack'
        })
      )
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, 'stale.zip'), 'stale', 'utf-8')

      const archives = await packageThirdPartyPlugins({ sourceDir, outputDir })
      const outputEntries = (await readdir(outputDir))
        .filter(entryName => entryName !== CACHE_FILE_NAME)
        .sort()

      expect(outputEntries).toEqual(['alpha-1.0.0.zip', 'theme-pack-2.1.0.zip'])
      expect(archives.map(archive => archive.platformId)).toEqual(['alpha', 'theme-pack'])

      for (const archive of archives) {
        const archiveStat = await stat(archive.archivePath)
        expect(archiveStat.size).toBeGreaterThan(0)
      }

      const extractedDir = join(tempRoot, 'extracted-alpha')
      await extractZip(archives[0].archivePath, { dir: extractedDir })
      expect(
        JSON.parse(await readFile(join(extractedDir, 'manifest.json'), 'utf-8'))
      ).toMatchObject({
        id: 'com.example.alpha',
        platformId: 'alpha'
      })
      expect(await readFile(join(extractedDir, 'index.mjs'), 'utf-8')).toBe('export default {}')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('streams plugin files into archives without buffering each file through readFile', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-streaming-plugin-package-'))
    const sourceDir = join(tempRoot, 'source')
    const archivePath = join(tempRoot, 'streamed.zip')

    try {
      await writePlugin(
        sourceDir,
        createManifest({
          id: 'com.example.streamed',
          name: 'Streamed',
          version: '1.0.0',
          platformId: 'streamed'
        })
      )
      const assetContent = 'chunked plugin asset\n'.repeat(64 * 1024)
      await writeFile(join(sourceDir, 'asset.txt'), assetContent, 'utf-8')

      const readFileSpy = vi.spyOn(fsPromises, 'readFile')
      try {
        await createZipFromDirectory(sourceDir, archivePath)
        expect(readFileSpy).not.toHaveBeenCalled()
      } finally {
        readFileSpy.mockRestore()
      }

      const extractedDir = join(tempRoot, 'extracted')
      await extractZip(archivePath, { dir: extractedDir })
      expect(await readFile(join(extractedDir, 'asset.txt'), 'utf-8')).toBe(assetContent)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('creates byte-stable archives when source contents are unchanged', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-reproducible-plugin-package-'))
    const sourceDir = join(tempRoot, 'source')
    const firstArchivePath = join(tempRoot, 'first.zip')
    const secondArchivePath = join(tempRoot, 'second.zip')

    try {
      await writePlugin(
        sourceDir,
        createManifest({
          id: 'com.example.reproducible',
          name: 'Reproducible',
          version: '1.0.0',
          platformId: 'reproducible'
        })
      )
      await writeFile(join(sourceDir, 'asset.txt'), 'stable asset contents', 'utf-8')

      await createZipFromDirectory(sourceDir, firstArchivePath)
      await createZipFromDirectory(sourceDir, secondArchivePath)

      expect(await readFile(secondArchivePath)).toEqual(await readFile(firstArchivePath))
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reuses unchanged plugin archives from the package cache', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-incremental-plugin-package-'))
    const sourceDir = join(tempRoot, 'plugins', 'third-party')
    const outputDir = await createOutputDir('luo-music-incremental-plugin-package-')

    try {
      await writePlugin(
        join(sourceDir, 'alpha'),
        createManifest({
          id: 'com.example.alpha',
          name: 'Alpha',
          version: '1.0.0',
          platformId: 'alpha'
        })
      )

      const firstArchives = await packageThirdPartyPlugins({ sourceDir, outputDir })
      const firstArchiveStat = await stat(firstArchives[0].archivePath)
      await writeFile(join(outputDir, 'stale.zip'), 'stale', 'utf-8')

      const secondArchives = await packageThirdPartyPlugins({ sourceDir, outputDir })
      const secondArchiveStat = await stat(secondArchives[0].archivePath)

      expect(secondArchiveStat.mtimeMs).toBe(firstArchiveStat.mtimeMs)
      expect(await readdir(outputDir)).not.toContain('stale.zip')
      expect(JSON.parse(await readFile(join(outputDir, CACHE_FILE_NAME), 'utf-8'))).toMatchObject({
        version: 1,
        archives: {
          'alpha-1.0.0.zip': {
            id: 'com.example.alpha',
            platformId: 'alpha',
            version: '1.0.0'
          }
        }
      })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('rebuilds cached archives when plugin contents change', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-cache-invalidated-plugin-package-'))
    const sourceDir = join(tempRoot, 'plugins', 'third-party')
    const pluginDir = join(sourceDir, 'alpha')
    const outputDir = await createOutputDir('luo-music-cache-invalidated-plugin-package-')

    try {
      await writePlugin(
        pluginDir,
        createManifest({
          id: 'com.example.alpha',
          name: 'Alpha',
          version: '1.0.0',
          platformId: 'alpha'
        })
      )

      const firstArchives = await packageThirdPartyPlugins({ sourceDir, outputDir })
      const firstArchiveContent = await readFile(firstArchives[0].archivePath)

      await writeFile(join(pluginDir, 'index.mjs'), 'export default { changed: true }', 'utf-8')

      const secondArchives = await packageThirdPartyPlugins({ sourceDir, outputDir })
      const secondArchiveContent = await readFile(secondArchives[0].archivePath)

      expect(secondArchiveContent).not.toEqual(firstArchiveContent)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('ignores an unreadable package cache and rebuilds archives', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-bad-cache-plugin-package-'))
    const sourceDir = join(tempRoot, 'plugins', 'third-party')
    const outputDir = await createOutputDir('luo-music-bad-cache-plugin-package-')

    try {
      await writePlugin(
        join(sourceDir, 'alpha'),
        createManifest({
          id: 'com.example.alpha',
          name: 'Alpha',
          version: '1.0.0',
          platformId: 'alpha'
        })
      )
      await writeFile(join(outputDir, CACHE_FILE_NAME), '{not json', 'utf-8')

      const archives = await packageThirdPartyPlugins({ sourceDir, outputDir })

      expect(archives).toHaveLength(1)
      expect(await readdir(outputDir)).toContain('alpha-1.0.0.zip')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('fails when the source directory is missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-missing-plugin-source-'))
    const outputDir = await createOutputDir('luo-music-missing-plugin-source-')

    try {
      await expect(
        packageThirdPartyPlugins({
          sourceDir: join(tempRoot, 'missing'),
          outputDir
        })
      ).rejects.toThrow('Plugin source directory not found')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('rejects output directories outside the build output root', async () => {
    await expect(
      packageThirdPartyPlugins({
        sourceDir: 'plugins/third-party',
        outputDir: '.'
      })
    ).rejects.toThrow('Plugin package output directory must stay inside')
  })

  it('rejects the build output root itself as the package output directory', async () => {
    await expect(
      packageThirdPartyPlugins({
        sourceDir: 'plugins/third-party',
        outputDir: 'out'
      })
    ).rejects.toThrow('Plugin package output directory must stay inside')
  })

  it('rejects output directories that would contain the plugin source directory', async () => {
    await expect(
      packageThirdPartyPlugins({
        sourceDir: 'out/third-party-plugins/source',
        outputDir: 'out/third-party-plugins'
      })
    ).rejects.toThrow(
      'Plugin package output directory must not contain the plugin source directory'
    )
  })

  it('rejects output directories inside the plugin source directory', async () => {
    await expect(
      packageThirdPartyPlugins({
        sourceDir: 'out/plugin-source',
        outputDir: 'out/plugin-source/packages'
      })
    ).rejects.toThrow(
      'Plugin package output directory must not be inside the plugin source directory'
    )
  })

  it('fails when the source directory has no plugin directories', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-empty-plugin-source-'))
    const sourceDir = join(tempRoot, 'plugins')
    const outputDir = await createOutputDir('luo-music-empty-plugin-source-')

    try {
      await mkdir(sourceDir, { recursive: true })

      await expect(
        packageThirdPartyPlugins({
          sourceDir,
          outputDir
        })
      ).rejects.toThrow('No third-party plugin directories found')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })

  it('fails when a plugin manifest points to a missing entry file', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'luo-music-bad-plugin-package-'))
    const sourceDir = join(tempRoot, 'plugins')
    const outputDir = await createOutputDir('luo-music-bad-plugin-package-')

    try {
      await mkdir(join(sourceDir, 'broken'), { recursive: true })
      await writeFile(
        join(sourceDir, 'broken', 'manifest.json'),
        JSON.stringify({
          ...createManifest({
            id: 'com.example.broken',
            name: 'Broken',
            version: '1.0.0',
            platformId: 'broken'
          }),
          entry: { main: 'missing.mjs', module: 'esm' }
        }),
        'utf-8'
      )

      await expect(packageThirdPartyPlugins({ sourceDir, outputDir })).rejects.toThrow(
        'Plugin entry not found: missing.mjs'
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
