import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { app } from 'electron'
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

  async installFromPath(inputPath: string): Promise<InstalledPluginLocation> {
    const sourcePath = path.resolve(inputPath)
    const sourceDirectory = await this.resolveSourceDirectory(sourcePath)
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

    await fs.mkdir(this.pluginsRoot, { recursive: true })
    await fs.rm(pluginRoot, { recursive: true, force: true })
    await fs.mkdir(pluginRoot, { recursive: true })
    await fs.cp(sourceDirectory, installPath, { recursive: true })

    const checksum = await this.computeFileChecksum(entryPath)

    return {
      manifest,
      installPath,
      entryPath,
      checksum
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

  private async resolveSourceDirectory(sourcePath: string): Promise<string> {
    const stat = await fs.stat(sourcePath).catch(() => null)

    if (!stat) {
      throw new Error(`Plugin path does not exist: ${sourcePath}`)
    }

    if (stat.isDirectory()) {
      return sourcePath
    }

    if (stat.isFile() && path.basename(sourcePath) === 'manifest.json') {
      return path.dirname(sourcePath)
    }

    throw new Error('Only plugin directories or manifest.json paths are supported for installation')
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
