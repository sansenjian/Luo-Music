import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const FAST_MAKE_MODE = process.env.LUO_FAST_MAKE === '1'
const packagingIgnorePatterns = [
  /^\/(?:\.ai|\.claude|\.codex|\.github|\.husky|\.idea|\.kilocode|\.trae|\.userData|\.vite_cache|\.vscode)(?:$|\/)/,
  /^\/(?:api|config|coverage|dist|docs|electron|playwright-report|server|src|test|test-results|tests)(?:$|\/)/,
  /^\/\.env(?:\.[^/]+)?$/,
  /^\/(?:AGENTS\.md|CHANGELOG\.md|CLAUDE\.md|CONTRIBUTING\.md|LICENSE|README\.md|electron\.vite\.config\.ts|eslint\.config\.js|forge\.config\.ts|index\.html|playwright\.config\.ts|qodana\.ya?ml|vite\.config\.ts|vitest\.config\.ts)$/,
  /^\/(?:\.editorconfig|\.gitignore|\.gitmessage|\.lintstagedrc\.json|\.npmignore|\.npmrc|\.prettierrc|\.projectstructure)$/,
  /^\/scripts\/dev\/dev-electron-launcher\.cjs$/,
  /^\/scripts\/utils(?:$|\/)/
] as const

const makers = FAST_MAKE_MODE
  ? [new MakerZIP({}, ['win32'])]
  : [
      new MakerSquirrel({
        name: 'LUO_Music',
        oneClick: false,
        allowToChangeInstallationDirectory: true
      } as never),
      new MakerZIP({}, ['darwin', 'linux', 'win32'])
    ]

const config: ForgeConfig = {
  packagerConfig: {
    name: 'LUO Music',
    executableName: 'LUO Music',
    appBundleId: 'com.sansenjian.luo-music',
    asar: {
      unpack:
        '**/node_modules/{conf,ajv,json-schema-traverse,atomically,dot-prop,uint8array-extras,type-fest}/**'
    },
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
    ignore: [...packagingIgnorePatterns]
  },
  rebuildConfig: {},
  makers,
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
  ]
}

export default config
