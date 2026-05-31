import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { app } from 'electron'
import extractZip from 'extract-zip'
import {
  ExternalPluginManifestSchema,
  type ExternalPluginManifest,
  type InstalledPluginLocation
} from './types'

function getDefaultUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    return path.resolve(process.cwd(), '.userData')
  }
}

export interface PluginInstallerDeps {
  pluginsRoot?: string
}

interface ResolvedPluginSource {
  sourceDirectory: string
  cleanup?: () => Promise<void>
}

interface PreparedPluginInstall {
  manifest: ExternalPluginManifest
  sourceDirectory: string
  pluginRoot: string
  installPath: string
  entryPath: string
}

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
const MAX_THEME_CSS_TEXT_LENGTH = 100_000

function assertSafePathSegment(value: string, label: string): void {
  if (!SAFE_PATH_SEGMENT_PATTERN.test(value)) {
    throw new Error(`${label} must be a safe path segment`)
  }
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function resolveContainedPath(rootPath: string, relativePath: string, label: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a relative path`)
  }

  const resolvedRoot = path.resolve(rootPath)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)

  if (!isPathInside(resolvedRoot, resolvedPath)) {
    throw new Error(`${label} must stay inside the plugin directory`)
  }

  return resolvedPath
}

export class PluginInstaller {
  private readonly pluginsRoot: string

  constructor(deps: PluginInstallerDeps = {}) {
    this.pluginsRoot = path.resolve(
      deps.pluginsRoot ?? path.join(getDefaultUserDataPath(), 'plugins', 'external')
    )
  }

  getPluginsRoot(): string {
    return this.pluginsRoot
  }

  async installManyFromPath(inputPath: string): Promise<InstalledPluginLocation[]> {
    const sourcePath = path.resolve(inputPath)
    const zipPackagePaths = await this.resolveZipPackageDirectory(sourcePath)

    if (!zipPackagePaths) {
      return [await this.installFromPath(sourcePath)]
    }

    const resolvedSources: ResolvedPluginSource[] = []

    try {
      for (const zipPackagePath of zipPackagePaths) {
        resolvedSources.push(await this.resolveSource(zipPackagePath))
      }

      const preparedInstalls = await Promise.all(
        resolvedSources.map(resolvedSource => this.prepareInstall(resolvedSource.sourceDirectory))
      )
      this.assertUniquePreparedPlugins(preparedInstalls)

      const installedPlugins: InstalledPluginLocation[] = []
      for (const preparedInstall of preparedInstalls) {
        installedPlugins.push(await this.commitPreparedInstall(preparedInstall))
      }

      return installedPlugins
    } finally {
      await Promise.all(resolvedSources.map(source => source.cleanup?.().catch(() => {})))
    }
  }

  async installFromPath(inputPath: string): Promise<InstalledPluginLocation> {
    const sourcePath = path.resolve(inputPath)
    const resolvedSource = await this.resolveSource(sourcePath)

    try {
      return await this.commitPreparedInstall(
        await this.prepareInstall(resolvedSource.sourceDirectory)
      )
    } finally {
      await resolvedSource.cleanup?.().catch(() => {})
    }
  }

  async uninstall(pluginId: string): Promise<void> {
    assertSafePathSegment(pluginId, 'Plugin id')
    await fs.rm(path.join(this.pluginsRoot, pluginId), { recursive: true, force: true })
  }

  async scanInstalledPlugins(): Promise<InstalledPluginLocation[]> {
    await fs.mkdir(this.pluginsRoot, { recursive: true })
    const pluginIds = await fs.readdir(this.pluginsRoot)
    const results: InstalledPluginLocation[] = []

    for (const pluginId of pluginIds) {
      if (!SAFE_PATH_SEGMENT_PATTERN.test(pluginId)) {
        continue
      }

      const pluginRoot = path.join(this.pluginsRoot, pluginId)
      const stat = await fs.stat(pluginRoot).catch(() => null)
      if (!stat?.isDirectory()) {
        continue
      }

      const versions = await fs.readdir(pluginRoot)
      const safeVersions = versions
        .filter(version => SAFE_PATH_SEGMENT_PATTERN.test(version))
        .sort()
      const latestVersion = safeVersions[safeVersions.length - 1]
      if (!latestVersion) {
        continue
      }

      const installPath = path.join(pluginRoot, latestVersion)
      try {
        const manifest = await this.readManifest(installPath)
        const entryPath = resolveContainedPath(installPath, manifest.entry.main, 'Plugin entry')
        const checksum = await this.computeFileChecksum(entryPath)
        results.push({
          manifest,
          installPath,
          entryPath,
          checksum
        })
      } catch {
        continue
      }
    }

    return results
  }

  private async resolveZipPackageDirectory(sourcePath: string): Promise<string[] | null> {
    const stat = await fs.stat(sourcePath).catch(() => null)
    if (!stat?.isDirectory()) {
      return null
    }

    if (await this.hasManifest(sourcePath)) {
      return null
    }

    const entries = await fs.readdir(sourcePath, { withFileTypes: true })
    const zipPackagePaths = entries
      .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.zip')
      .map(entry => path.join(sourcePath, entry.name))
      .sort((left, right) => path.basename(left).localeCompare(path.basename(right)))

    if (zipPackagePaths.length === 0) {
      return null
    }

    return zipPackagePaths
  }

  private async prepareInstall(sourceDirectory: string): Promise<PreparedPluginInstall> {
    const manifest = await this.readManifest(sourceDirectory)
    const sourceEntryPath = resolveContainedPath(
      sourceDirectory,
      manifest.entry.main,
      'Plugin entry'
    )

    await this.assertFileExists(sourceEntryPath, `Plugin entry not found: ${manifest.entry.main}`)

    const pluginRoot = path.join(this.pluginsRoot, manifest.id)
    const installPath = path.join(pluginRoot, manifest.version)
    const entryPath = resolveContainedPath(installPath, manifest.entry.main, 'Plugin entry')

    return {
      manifest,
      sourceDirectory,
      pluginRoot,
      installPath,
      entryPath
    }
  }

  private assertUniquePreparedPlugins(preparedInstalls: PreparedPluginInstall[]): void {
    const pluginIds = new Set<string>()
    const platformIds = new Set<string>()

    for (const preparedInstall of preparedInstalls) {
      if (pluginIds.has(preparedInstall.manifest.id)) {
        throw new Error(`Duplicate plugin id in batch install: ${preparedInstall.manifest.id}`)
      }
      if (platformIds.has(preparedInstall.manifest.platformId)) {
        throw new Error(
          `Duplicate plugin platform id in batch install: ${preparedInstall.manifest.platformId}`
        )
      }

      pluginIds.add(preparedInstall.manifest.id)
      platformIds.add(preparedInstall.manifest.platformId)
    }
  }

  private async commitPreparedInstall(
    preparedInstall: PreparedPluginInstall
  ): Promise<InstalledPluginLocation> {
    await fs.mkdir(this.pluginsRoot, { recursive: true })

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const stagingRoot = path.join(
      this.pluginsRoot,
      `.staging-${preparedInstall.manifest.id}-${uniqueSuffix}`
    )
    const backupRoot = path.join(
      this.pluginsRoot,
      `.backup-${preparedInstall.manifest.id}-${uniqueSuffix}`
    )
    const stagingInstallPath = path.join(stagingRoot, preparedInstall.manifest.version)
    const stagingEntryPath = resolveContainedPath(
      stagingInstallPath,
      preparedInstall.manifest.entry.main,
      'Plugin entry'
    )
    let hasBackup = false
    let promotedStaging = false

    try {
      await fs.rm(stagingRoot, { recursive: true, force: true })
      await fs.rm(backupRoot, { recursive: true, force: true })
      await fs.cp(preparedInstall.sourceDirectory, stagingInstallPath, { recursive: true })
      await this.assertFileExists(
        stagingEntryPath,
        `Plugin entry not found: ${preparedInstall.manifest.entry.main}`
      )
      const checksum = await this.computeFileChecksum(stagingEntryPath)

      const existingPluginRoot = await fs.stat(preparedInstall.pluginRoot).catch(() => null)
      if (existingPluginRoot) {
        await fs.rename(preparedInstall.pluginRoot, backupRoot)
        hasBackup = true
      }

      await fs.rename(stagingRoot, preparedInstall.pluginRoot)
      promotedStaging = true
      if (hasBackup) {
        await fs.rm(backupRoot, { recursive: true, force: true })
        hasBackup = false
      }

      return {
        manifest: preparedInstall.manifest,
        installPath: preparedInstall.installPath,
        entryPath: preparedInstall.entryPath,
        checksum
      }
    } catch (error) {
      if (promotedStaging) {
        await fs.rm(preparedInstall.pluginRoot, { recursive: true, force: true }).catch(() => {})
      }
      if (hasBackup) {
        await fs.rename(backupRoot, preparedInstall.pluginRoot).catch(() => {})
        hasBackup = false
      }
      throw error
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => {})
      if (hasBackup) {
        await fs.rm(backupRoot, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  private async resolveSource(sourcePath: string): Promise<ResolvedPluginSource> {
    const stat = await fs.stat(sourcePath).catch(() => null)

    if (!stat) {
      throw new Error(`Plugin path does not exist: ${sourcePath}`)
    }

    if (stat.isDirectory()) {
      return { sourceDirectory: sourcePath }
    }

    if (stat.isFile() && path.basename(sourcePath) === 'manifest.json') {
      return { sourceDirectory: path.dirname(sourcePath) }
    }

    if (stat.isFile() && path.extname(sourcePath).toLowerCase() === '.zip') {
      return this.extractZipSource(sourcePath)
    }

    throw new Error(
      'Only plugin directories, manifest.json paths, or .zip plugin packages are supported for installation'
    )
  }

  private async extractZipSource(zipPath: string): Promise<ResolvedPluginSource> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'luo-plugin-install-'))

    try {
      await extractZip(zipPath, { dir: tempRoot })
      const sourceDirectory = await this.resolveExtractedSourceDirectory(tempRoot)

      return {
        sourceDirectory,
        cleanup: () => fs.rm(tempRoot, { recursive: true, force: true })
      }
    } catch (error) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  private async resolveExtractedSourceDirectory(extractedRoot: string): Promise<string> {
    if (await this.hasManifest(extractedRoot)) {
      return extractedRoot
    }

    const entries = await fs.readdir(extractedRoot, { withFileTypes: true })
    const candidates: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '__MACOSX') {
        continue
      }

      const candidate = path.join(extractedRoot, entry.name)
      if (await this.hasManifest(candidate)) {
        candidates.push(candidate)
      }
    }

    if (candidates.length === 1) {
      return candidates[0]
    }

    if (candidates.length > 1) {
      throw new Error('Plugin zip package contains multiple top-level plugin directories')
    }

    throw new Error(
      'Plugin zip package must contain manifest.json at the archive root or inside one top-level directory'
    )
  }

  private async hasManifest(directory: string): Promise<boolean> {
    const manifestStat = await fs.stat(path.join(directory, 'manifest.json')).catch(() => null)
    return Boolean(manifestStat?.isFile())
  }

  private async readManifest(pluginDirectory: string): Promise<ExternalPluginManifest> {
    const manifestPath = path.join(pluginDirectory, 'manifest.json')
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    const parsedManifest = JSON.parse(manifestContent) as unknown
    const result = ExternalPluginManifestSchema.safeParse(parsedManifest)

    if (!result.success) {
      throw new Error(`Invalid plugin manifest: ${result.error.message}`)
    }

    assertSafePathSegment(result.data.id, 'Plugin id')
    assertSafePathSegment(result.data.version, 'Plugin version')

    const manifest = structuredClone(result.data)
    await this.inlineThemeCssFiles(pluginDirectory, manifest)

    return manifest
  }

  private async inlineThemeCssFiles(
    pluginDirectory: string,
    manifest: ExternalPluginManifest
  ): Promise<void> {
    const themeResources = manifest.contributions?.themeResources
    if (!themeResources) {
      return
    }

    for (const themeResource of themeResources) {
      if (!themeResource.cssFile) {
        continue
      }

      const cssFilePath = resolveContainedPath(
        pluginDirectory,
        themeResource.cssFile,
        'Theme CSS file'
      )
      await this.assertFileExists(cssFilePath, `Theme CSS file not found: ${themeResource.cssFile}`)
      const cssText = await fs.readFile(cssFilePath, 'utf-8')
      if (cssText.length > MAX_THEME_CSS_TEXT_LENGTH) {
        throw new Error(`Theme CSS file is too large: ${themeResource.cssFile}`)
      }

      themeResource.cssText = cssText
    }
  }

  private async assertFileExists(filePath: string, errorMessage: string): Promise<void> {
    const stat = await fs.lstat(filePath).catch(() => null)
    if (!stat?.isFile()) {
      throw new Error(errorMessage)
    }
  }

  private async computeFileChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  }
}
