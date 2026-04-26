const {
  appId,
  asarUnpackPattern,
  electronBuilderExtraResources,
  productName
} = require('./config/packaging.shared.cjs')

module.exports = {
  appId,
  productName,
  artifactName: '${productName}-portable-${version}.${ext}',
  directories: {
    output: 'out/portable'
  },
  asar: true,
  asarUnpack: [asarUnpackPattern],
  files: [
    'build/**/*',
    'public/**/*',
    'plugins/third-party/**/*',
    '!build/runtime{,/**}',
    '!build/service{,/**}',
    '!**/*.map'
  ],
  extraResources: electronBuilderExtraResources,
  win: {
    target: [
      {
        target: 'portable',
        arch: ['x64']
      }
    ]
  }
}
