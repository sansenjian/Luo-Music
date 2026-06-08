const { spawnSync: defaultSpawnSync } = require('node:child_process')
const defaultFs = require('node:fs')
const defaultPath = require('node:path')

function main(options = {}) {
  const context = createBuildContext(options)

  if (!context.fs.existsSync(context.helperManifestPath)) {
    warnAndSkip(context, `missing Cargo manifest: ${context.helperManifestPath}`)
    return context.exitCode
  }

  const cargoCommand = resolveCargoCommand(context)
  const cargoArgs = ['build', '--manifest-path', context.helperManifestPath]
  const cargoFeatures = resolveCargoFeatures(context)
  if (context.isRelease) {
    cargoArgs.push('--release')
  }
  if (cargoFeatures.length > 0) {
    cargoArgs.push('--features', cargoFeatures.join(','))
  }

  context.console.log(`[build-audio-output-helper] ${cargoCommand} ${cargoArgs.join(' ')}`)
  const result = context.spawnSync(cargoCommand, cargoArgs, {
    cwd: context.projectRoot,
    stdio: 'inherit',
    shell: false
  })

  if (result.error) {
    warnAndSkip(
      context,
      `failed to start cargo: ${result.error.message}. Install Rust or set CARGO to ${context.path.basename(
        cargoCommand
      )}.`
    )
    return context.exitCode
  }

  if (result.status !== 0) {
    return result.status ?? 1
  }

  if (!context.fs.existsSync(context.helperExePath)) {
    warnAndSkip(context, `cargo finished, but helper was not found at ${context.helperExePath}`)
    return context.exitCode
  }

  if (context.copyResource) {
    context.fs.mkdirSync(context.packagedNativeDir, { recursive: true })
    context.fs.copyFileSync(context.helperExePath, context.packagedHelperPath)
    ensureExecutableModeIfNeeded(context, context.packagedHelperPath, { required: context.required })
    stampWindowsResourcesIfNeeded(context, context.packagedHelperPath, { required: context.required })
    if (context.exitCode) {
      return context.exitCode
    }
    context.console.log(`[build-audio-output-helper] copied ${context.packagedHelperPath}`)
    return 0
  }

  ensureExecutableModeIfNeeded(context, context.helperExePath, { required: context.required })
  stampWindowsResourcesIfNeeded(context, context.helperExePath, { required: context.required })
  if (context.exitCode) {
    return context.exitCode
  }
  context.console.log(`[build-audio-output-helper] built ${context.helperExePath}`)
  return 0
}

function createBuildContext(options = {}) {
  const fs = options.fs ?? defaultFs
  const path = options.path ?? defaultPath
  const processLike = options.process ?? process
  const projectRoot = options.projectRoot ?? path.resolve(options.scriptDir ?? __dirname, '..', '..')
  const argv = options.argv ?? processLike.argv.slice(2)
  const args = new Set(argv)
  const platform = options.platform ?? processLike.platform
  const isRelease = args.has('--release')
  const targetProfile = isRelease ? 'release' : 'debug'
  const helperFileName = getAudioOutputHelperFileName(platform)
  const helperManifestPath = path.join(projectRoot, 'native', 'audio-output-helper', 'Cargo.toml')
  const helperExePath = path.join(
    projectRoot,
    'native',
    'audio-output-helper',
    'target',
    targetProfile,
    helperFileName
  )
  const packagedNativeDir = path.join(projectRoot, 'build', 'native')

  return {
    args,
    console: options.console ?? console,
    copyResource: args.has('--copy-resource'),
    env: options.env ?? processLike.env,
    exitCode: 0,
    fs,
    helperExePath,
    helperFileName,
    helperIconPath: path.join(projectRoot, 'public', 'tray.ico'),
    helperManifestPath,
    isRelease,
    packageJson: options.packageJson,
    packageJsonPath: path.join(projectRoot, 'package.json'),
    packagedHelperPath: path.join(packagedNativeDir, helperFileName),
    packagedNativeDir,
    path,
    platform,
    projectRoot,
    require: options.require ?? require,
    required: args.has('--required'),
    spawnSync: options.spawnSync ?? defaultSpawnSync
  }
}

function getAudioOutputHelperFileName(platform = process.platform) {
  return platform === 'win32' ? 'audio-output-helper.exe' : 'audio-output-helper'
}

function warnAndSkip(context, message, shouldFail = context.required) {
  context.console.warn(`[build-audio-output-helper] ${message}`)
  if (shouldFail) {
    context.exitCode = 1
  }
}

function resolveCargoCommand(context) {
  if (context.env.CARGO) {
    return context.env.CARGO
  }

  if (context.platform === 'win32') {
    const userCargo = context.path.join(context.env.USERPROFILE || '', '.cargo', 'bin', 'cargo.exe')
    if (context.fs.existsSync(userCargo)) {
      return userCargo
    }
  }

  return context.platform === 'win32' ? 'cargo.exe' : 'cargo'
}

function resolveCargoFeatures(context) {
  return String(context.env.LUO_AUDIO_OUTPUT_HELPER_FEATURES || '')
    .split(/[,\s]+/)
    .map(feature => feature.trim())
    .filter(Boolean)
}

function stampWindowsResourcesIfNeeded(context, exePath, options = {}) {
  if (context.platform !== 'win32') {
    return
  }

  stampWindowsResources(context, exePath, options)
}

function stampWindowsResources(context, exePath, options = {}) {
  const shouldFail = options.required ?? context.required

  let ResEdit
  try {
    ResEdit = context.require('resedit')
  } catch (error) {
    warnAndSkip(context, `resedit is unavailable: ${error.message}`, shouldFail)
    return
  }

  try {
    const packageJson = context.packageJson ?? loadPackageJson(context)
    const version = normalizeVersion(packageJson.version)
    const data = context.fs.readFileSync(exePath)
    const exe = ResEdit.NtExecutable.from(data)
    const res = ResEdit.NtExecutableResource.from(exe)
    const language = { lang: 1033, codepage: 1200 }
    const versionInfo =
      ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ??
      ResEdit.Resource.VersionInfo.createEmpty()

    versionInfo.setFileVersion(version, language.lang)
    versionInfo.setProductVersion(version, language.lang)
    versionInfo.setStringValues(
      language,
      {
        CompanyName: 'sansenjian',
        FileDescription: 'LUO Music',
        InternalName: 'LUO Music Audio Output Helper',
        OriginalFilename: context.helperFileName,
        ProductName: 'LUO Music'
      },
      true
    )
    versionInfo.outputToResourceEntries(res.entries)

    if (context.fs.existsSync(context.helperIconPath)) {
      const iconFile = ResEdit.Data.IconFile.from(context.fs.readFileSync(context.helperIconPath))
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1,
        language.lang,
        iconFile.icons.map(item => item.data)
      )
    }

    res.outputResource(exe)
    context.fs.writeFileSync(exePath, Buffer.from(exe.generate()))
    context.console.log(`[build-audio-output-helper] stamped Windows resources in ${exePath}`)
  } catch (error) {
    warnAndSkip(
      context,
      `failed to stamp Windows resources: ${error.message}. Close LUO Music and retry if this file is locked.`,
      shouldFail
    )
  }
}

function ensureExecutableModeIfNeeded(context, helperPath, options = {}) {
  if (context.platform === 'win32') {
    return
  }

  const shouldFail = options.required ?? context.required
  try {
    const mode = context.fs.statSync(helperPath).mode
    context.fs.chmodSync(helperPath, mode | 0o755)
  } catch (error) {
    warnAndSkip(
      context,
      `failed to mark helper executable: ${error.message}. Check permissions for ${helperPath}.`,
      shouldFail
    )
  }
}

function loadPackageJson(context) {
  return JSON.parse(context.fs.readFileSync(context.packageJsonPath, 'utf8'))
}

function normalizeVersion(version) {
  const parts = String(version)
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .filter(part => Number.isFinite(part) && part >= 0)

  while (parts.length < 4) {
    parts.push(0)
  }

  return parts.slice(0, 4).join('.')
}

if (require.main === module) {
  const exitCode = main()
  if (exitCode) {
    process.exitCode = exitCode
  }
}

module.exports = {
  createBuildContext,
  ensureExecutableModeIfNeeded,
  getAudioOutputHelperFileName,
  main,
  normalizeVersion,
  resolveCargoFeatures
}
