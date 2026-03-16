import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import fs from 'fs-extra'
import path from 'node:path'

interface PackagerConfigWithAsar {
  name: string
  executableName: string
  appBundleId: string
  asar: boolean
  asarUnpack?: string[]
  extraResource: string[]
  download: {
    unsafelyDisableChecksums: boolean
    mirrorOptions: {
      mirror: string
      customDir: string
    }
  }
  ignore: (string | RegExp)[]
}

interface ForgeConfigWithAsar {
  packagerConfig: PackagerConfigWithAsar
  rebuildConfig: Record<string, never>
  makers: unknown[]
  plugins: unknown[]
  hooks: {
    packageAfterPrune?: (config: unknown, buildPath: string) => Promise<void>
  }
}

const config: ForgeConfigWithAsar = {
  packagerConfig: {
    name: 'LUO Music',
    executableName: 'LUO Music',
    appBundleId: 'com.sansenjian.luo-music',
    asar: true,
    asarUnpack: [
      '**/node_modules/conf/**',
      '**/node_modules/ajv/**',
      '**/node_modules/json-schema-traverse/**',
      '**/node_modules/atomically/**',
      '**/node_modules/dot-prop/**',
      '**/node_modules/uint8array-extras/**',
      '**/node_modules/type-fest/**'
    ],
    extraResource: [
      'build/server',
      'scripts/dev/qq-api-server.cjs',
      'scripts/dev/netease-api-server.cjs'
    ],
    download: {
      unsafelyDisableChecksums: true,
      mirrorOptions: {
        mirror: 'https://github.com/electron/electron/releases/download/',
        customDir: 'v{{ version }}'
      }
    },
    ignore: [
      '.github',
      '.vscode',
      '.idea',
      '.trae',
      '.kilocode',
      '.git',
      'release_v2',
      'dist',
      'docs',
      'tests',
      'test',
      'scripts/utils',
      'scripts/dev/dev-electron-launcher.cjs',
      '.vite_cache',
      '.electron_cache',
      'src',
      /^electron\//,
      'index.html',
      'vite.config.ts',
      'electron.vite.config.ts',
      'forge.config.ts',
      'server.ts',
      'tsup.config'
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'LUO_Music',
      oneClick: false,
      allowToChangeInstallationDirectory: true
    } as never),
    new MakerZIP({}, ['darwin', 'linux', 'win32'])
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ],
  hooks: {
    packageAfterPrune: async (_config: unknown, buildPath: string): Promise<void> => {
      const filesToRemove = [
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
        'docs',
        '.github',
        '.vscode',
        '.idea'
      ]

      for (const file of filesToRemove) {
        const filePath = path.join(buildPath, file)

        if (fs.existsSync(filePath)) {
          await fs.remove(filePath)
        }
      }

      const projectRoot = process.cwd()
      const sourceNodeModulesRoot = path.join(projectRoot, 'node_modules')
      const buildNodeModulesRoot = path.join(buildPath, 'node_modules')
      const visitedPackages = new Set<string>()
      const rootPackageJson = await fs.readJson(path.join(projectRoot, 'package.json')) as {
        dependencies?: Record<string, string>
      }
      const packageNamesToRepair = Object.keys(rootPackageJson.dependencies ?? {})

      const getPackageDir = (nodeModulesRoot: string, packageName: string) =>
        path.join(nodeModulesRoot, ...packageName.split('/'))

      const ensurePackageRuntimeFiles = async (packageName: string): Promise<void> => {
        if (visitedPackages.has(packageName)) {
          return
        }

        visitedPackages.add(packageName)

        const sourcePackageDir = getPackageDir(sourceNodeModulesRoot, packageName)
        const buildPackageDir = getPackageDir(buildNodeModulesRoot, packageName)

        if (!fs.existsSync(sourcePackageDir)) {
          console.warn(`Warning: source package not found for ${packageName}`)
          return
        }

        if (!fs.existsSync(buildPackageDir)) {
          console.warn(`Warning: packaged dependency directory missing for ${packageName}, copying package directory`)
        }

        await fs.copy(sourcePackageDir, buildPackageDir, {
          overwrite: false,
          errorOnExist: false
        })

        const sourcePackageJsonPath = path.join(sourcePackageDir, 'package.json')

        if (!fs.existsSync(sourcePackageJsonPath)) {
          return
        }

        console.log(`Synced runtime files for ${packageName}`)

        const packageJson = await fs.readJson(sourcePackageJsonPath) as {
          dependencies?: Record<string, string>
          optionalDependencies?: Record<string, string>
        }

        const runtimeDependencies = {
          ...packageJson.dependencies,
          ...packageJson.optionalDependencies
        }

        for (const dependencyName of Object.keys(runtimeDependencies)) {
          await ensurePackageRuntimeFiles(dependencyName)
        }
      }

      for (const packageName of packageNamesToRepair) {
        await ensurePackageRuntimeFiles(packageName)
      }
    }
  }
}

export default config
