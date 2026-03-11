import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { resolve } from 'path'

const config: ForgeConfig = {
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
    // icon: resolve(__dirname, 'public/icon'), // 暂时注释，需要创建 icon.ico 文件
    extraResource: [
      'build/server'
    ],
    // 跳过 checksum 验证（Electron v40.0.0 的 checksum 文件存在问题）
    electronDownload: {
      verifyChecksum: false,
      // 使用镜像源下载 Electron
      mirrorOptions: {
        mirror: 'https://npmmirror.com/mirrors/electron/',
        customDir: '{{ version }}'
      },
      // 跳过 checksum 验证
      strictSSL: false
    },
    // 忽略不需要打包的文件（使用正则表达式精确匹配）
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
      'scripts',
      '.vite_cache',
      '.electron_cache',
      'src',
      /^electron\//,  // 只忽略根目录的 electron 源码目录，不忽略 build/electron
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
      name: 'LUO_Music',  // Squirrel 包名不能包含空格
      // setupIcon: resolve(__dirname, 'public/icon.ico'), // 暂时注释，需要创建 icon.ico 文件
      // 允许用户选择安装目录
      oneClick: false,
      allowToChangeInstallationDirectory: true
    }),
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
    packageAfterPrune: async (_config, buildPath) => {
      const fs = await import('fs-extra')
      const path = await import('path')
      
      // 清理不必要的文件以减小包体积
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
      
      // 修复 pnpm 符号链接问题：确保 conf/dist 目录存在
      // pnpm 使用符号链接管理依赖，打包时可能丢失 dist 目录
      const confDir = path.join(buildPath, 'node_modules', 'conf')
      const confDistDir = path.join(confDir, 'dist')
      
      if (fs.existsSync(confDir) && !fs.existsSync(confDistDir)) {
        // 从项目根目录的 node_modules 复制 conf/dist
        const projectRoot = path.resolve(__dirname)
        const sourceConfDist = path.join(projectRoot, 'node_modules', 'conf', 'dist')
        
        if (fs.existsSync(sourceConfDist)) {
          console.log('Copying conf/dist from project node_modules...')
          await fs.copy(sourceConfDist, confDistDir)
          console.log('conf/dist copied successfully')
        } else {
          console.warn('Warning: conf/dist not found in project node_modules')
        }
      }
    }
  }
}

export default config
