import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const FAST_MAKE_MODE = process.env.LUO_FAST_MAKE === '1'
const packagingLocalesToKeep = new Set(['en-US.pak', 'zh-CN.pak'] as const)
type PackagerHookDone = (error?: Error | null) => void
const packagingExtraResources = [
  'build/server',
  'build/runtime/qq-api-server.cjs',
  'scripts/dev/qq-search-fallback.cjs',
  'scripts/dev/netease-api-server.cjs'
] as const
const packagingWorkspaceArtifactsToRemove = [
  '.ai',
  '.claude',
  '.codex',
  '.github',
  '.husky',
  '.idea',
  '.kilocode',
  '.playwright-mcp',
  '.trae',
  '.userData',
  '.vite_cache',
  '.vscode'
] as const
const packagingNodeModulesToRemoveAfterPrune = [
  'node_modules/.vite-temp',
  'node_modules/@electron-forge',
  'node_modules/@playwright',
  'node_modules/@sentry/bundler-plugin-core',
  'node_modules/@sentry/rollup-plugin',
  'node_modules/@sentry/vite-plugin',
  'node_modules/@types',
  'node_modules/@vitejs',
  'node_modules/electron',
  'node_modules/electron-nightly',
  'node_modules/playwright',
  'node_modules/playwright-core',
  'node_modules/typescript',
  'node_modules/vite',
  'node_modules/vitest'
] as const
const packagingIgnorePatterns = [
  /^\/(?:\.ai|\.claude|\.codex|\.github|\.husky|\.idea|\.kilocode|\.playwright-mcp|\.trae|\.userData|\.vite_cache|\.vscode)(?:$|\/)/,
  /^\/(?:api|config|coverage|dist|docs|electron|playwright-report|server|src|test|test-results|tests)(?:$|\/)/,
  /^\/build\/runtime(?:$|\/)/,
  /^\/\.env(?:\.[^/]+)?$/,
  /^\/(?:AGENTS\.md|CHANGELOG\.md|CLAUDE\.md|CONTRIBUTING\.md|LICENSE|README\.md|electron\.vite\.config\.ts|eslint\.config\.js|forge\.config\.ts|index\.html|playwright\.config\.ts|qodana\.ya?ml|vite\.config\.ts|vitest\.config\.ts)$/,
  /^\/(?:\.editorconfig|\.gitignore|\.gitmessage|\.lintstagedrc\.json|\.npmignore|\.npmrc|\.prettierrc|\.projectstructure)$/,
  /^\/scripts(?:$|\/)/,
  /^\/.*\.map$/,
  /^\/node_modules\/@fontsource(?:$|\/)/,
  /^\/node_modules\/@electron-forge(?:$|\/)/,
  /^\/node_modules\/@playwright(?:$|\/)/,
  /^\/node_modules\/@sentry\/(?:bundler-plugin-core|rollup-plugin|vite-plugin)(?:$|\/)/,
  /^\/node_modules\/@types(?:$|\/)/,
  /^\/node_modules\/@vitejs(?:$|\/)/,
  /^\/node_modules\/date-fns(?:$|\/)/,
  /^\/node_modules\/electron(?:$|\/)/,
  /^\/node_modules\/playwright(?:-core)?(?:$|\/)/,
  /^\/node_modules\/typescript(?:$|\/)/,
  /^\/node_modules\/vite(?:$|\/)/,
  /^\/node_modules\/vitest(?:$|\/)/,
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
    name: 'LUO Music',
    executableName: 'LUO Music',
    appBundleId: 'com.sansenjian.luo-music',
    prune: true,
    asar: {
      unpack:
        '**/node_modules/{conf,ajv,json-schema-traverse,atomically,dot-prop,uint8array-extras,type-fest}/**'
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
