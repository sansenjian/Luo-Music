import { readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

type PackagingSharedConfig = {
  appId: string
  asarUnpackPattern: string
  packagingExtraResources: string[]
  packagingIgnoredNodeModulePaths: string[]
  packagingNodeModulesToRemoveAfterPrune: string[]
  packagingWorkspaceArtifactsToRemove: string[]
  productName: string
}

const require = createRequire(import.meta.url)
const packagingShared = require('../config/packaging.shared.cjs') as PackagingSharedConfig

const FAST_MAKE_MODE = process.env.LUO_FAST_MAKE === '1'
const packagingLocalesToKeep = new Set(['en-US.pak', 'zh-CN.pak'] as const)
type PackagerHookDone = (error?: Error | null) => void
const packagingExtraResources = packagingShared.packagingExtraResources
export const packagingWorkspaceArtifactsToRemove =
  packagingShared.packagingWorkspaceArtifactsToRemove
export const packagingNodeModulesToRemoveAfterPrune =
  packagingShared.packagingNodeModulesToRemoveAfterPrune
const packagingIgnoredNodeModulePaths = packagingShared.packagingIgnoredNodeModulePaths

function escapeRegexFragment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createIgnorePatterns(paths: readonly string[]): RegExp[] {
  return paths.map(targetPath => new RegExp(`^/${escapeRegexFragment(targetPath)}(?:$|/)`))
}

const packagingIgnorePatterns = [
  ...createIgnorePatterns(packagingWorkspaceArtifactsToRemove),
  /^\/(?:api|coverage|dist|docs|electron|playwright-report|plugins|server|src|test|test-results|tests)(?:$|\/)/,
  /^\/build\/runtime(?:$|\/)/,
  /^\/\.env(?:\.[^/]+)?$/,
  /^\/(?:AGENTS\.md|CHANGELOG\.md|CLAUDE\.md|CONTRIBUTING\.md|LICENSE|README\.md|index\.html)$/,
  /^\/(?:\.editorconfig|\.gitignore|\.gitmessage|\.npmignore|\.npmrc|\.projectstructure)$/,
  /^\/\.config(?:$|\/)/,
  /^\/config(?:$|\/)/,
  /^\/scripts(?:$|\/)/,
  /^\/.*\.map$/,
  ...createIgnorePatterns(packagingIgnoredNodeModulePaths),
  /^\/node_modules\/(?:.*\/)?(?:README|readme|CHANGELOG|changelog|CHANGES|changes|AUTHORS|authors|CONTRIBUTING|contributing)(?:\.[^/]+)?$/,
  /^\/node_modules\/(?:.*\/)?(?:\.github|\.vscode|coverage|docs?|example|examples|test|tests|__tests__)(?:$|\/)/
] as const

const makers = FAST_MAKE_MODE
  ? [new MakerZIP({}, ['darwin', 'linux', 'win32'])]
  : [
      new MakerSquirrel({
        name: 'LUO_Music'
      }),
      new MakerZIP({}, ['darwin', 'linux', 'win32'])
    ]

async function pruneElectronLocales(buildPath: string): Promise<void> {
  const localesDir = join(buildPath, 'locales')
  const localeEntries = await readdir(localesDir, { withFileTypes: true }).catch(() => [])

  await Promise.all(
    localeEntries
      .filter(
        entry =>
          entry.isFile() && !packagingLocalesToKeep.has(entry.name as 'en-US.pak' | 'zh-CN.pak')
      )
      .map(entry => rm(join(localesDir, entry.name), { force: true }))
  )
}

async function removePackagedPaths(
  buildPath: string,
  targetPaths: readonly string[]
): Promise<void> {
  const candidateRoots = [buildPath, join(buildPath, 'resources', 'app')]

  await Promise.all(
    candidateRoots.flatMap(rootPath =>
      targetPaths.map(targetPath =>
        rm(join(rootPath, targetPath), { recursive: true, force: true })
      )
    )
  )
}

async function removePackagedWorkspaceArtifacts(buildPath: string): Promise<void> {
  await removePackagedPaths(buildPath, packagingWorkspaceArtifactsToRemove)
}

async function removePackagedBuildOnlyModules(buildPath: string): Promise<void> {
  await removePackagedPaths(buildPath, packagingNodeModulesToRemoveAfterPrune)
}

const config: ForgeConfig = {
  packagerConfig: {
    name: packagingShared.productName,
    executableName: packagingShared.productName,
    appBundleId: packagingShared.appId,
    prune: true,
    asar: {
      unpack: packagingShared.asarUnpackPattern
    },
    extraResource: [...packagingExtraResources],
    download: {
      unsafelyDisableChecksums: true,
      mirrorOptions: {
        mirror: 'https://github.com/electron/electron/releases/download/',
        customDir: 'v{{ version }}'
      }
    },
    ignore: [...packagingIgnorePatterns],
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, done: PackagerHookDone) => {
        void removePackagedWorkspaceArtifacts(buildPath).then(
          () => done(),
          error => {
            done(error instanceof Error ? error : new Error(String(error)))
          }
        )
      }
    ],
    afterPrune: [
      (buildPath, _electronVersion, _platform, _arch, done: PackagerHookDone) => {
        void Promise.all([
          removePackagedWorkspaceArtifacts(buildPath),
          removePackagedBuildOnlyModules(buildPath)
        ]).then(
          () => done(),
          error => {
            done(error instanceof Error ? error : new Error(String(error)))
          }
        )
      }
    ],
    afterExtract: [
      (buildPath, _electronVersion, _platform, _arch, done: PackagerHookDone) => {
        void pruneElectronLocales(buildPath).then(
          () => done(),
          error => {
            done(error instanceof Error ? error : new Error(String(error)))
          }
        )
      }
    ]
  },
  rebuildConfig: {},
  makers,
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
}

export default config
