const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')
const args = new Set(process.argv.slice(2))
const isRelease = args.has('--release')
const copyResource = args.has('--copy-resource')
const required = args.has('--required')

const helperManifestPath = path.join(projectRoot, 'native', 'smtc-helper', 'Cargo.toml')
const targetProfile = isRelease ? 'release' : 'debug'
const helperExePath = path.join(
  projectRoot,
  'native',
  'smtc-helper',
  'target',
  targetProfile,
  'smtc-helper.exe'
)
const packagedNativeDir = path.join(projectRoot, 'build', 'native')
const packagedHelperPath = path.join(packagedNativeDir, 'smtc-helper.exe')
const packageJson = require(path.join(projectRoot, 'package.json'))
const helperIconPath = path.join(projectRoot, 'public', 'tray.ico')

function warnAndSkip(message, shouldFail = required) {
  console.warn(`[build-smtc-helper] ${message}`)
  if (shouldFail) {
    process.exitCode = 1
  }
}

function resolveCargoCommand() {
  if (process.env.CARGO) {
    return process.env.CARGO
  }

  if (process.platform === 'win32') {
    const userCargo = path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'cargo.exe')
    if (fs.existsSync(userCargo)) {
      return userCargo
    }
  }

  return process.platform === 'win32' ? 'cargo.exe' : 'cargo'
}

if (process.platform !== 'win32') {
  console.log('[build-smtc-helper] skipping: Windows SMTC helper is only needed on Windows')
  process.exit(0)
}

if (!fs.existsSync(helperManifestPath)) {
  warnAndSkip(`missing Cargo manifest: ${helperManifestPath}`)
  process.exit()
}

const cargoCommand = resolveCargoCommand()
const cargoArgs = ['build', '--manifest-path', helperManifestPath]
if (isRelease) {
  cargoArgs.push('--release')
}

console.log(`[build-smtc-helper] ${cargoCommand} ${cargoArgs.join(' ')}`)
const result = spawnSync(cargoCommand, cargoArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
})

if (result.error) {
  warnAndSkip(
    `failed to start cargo: ${result.error.message}. Install Rust or set CARGO to cargo.exe.`
  )
  process.exit()
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1
  process.exit()
}

if (!fs.existsSync(helperExePath)) {
  warnAndSkip(`cargo finished, but helper was not found at ${helperExePath}`)
  process.exit()
}

if (copyResource) {
  fs.mkdirSync(packagedNativeDir, { recursive: true })
  fs.copyFileSync(helperExePath, packagedHelperPath)
  stampWindowsResources(packagedHelperPath, { required })
  if (process.exitCode) {
    process.exit()
  }
  console.log(`[build-smtc-helper] copied ${packagedHelperPath}`)
} else {
  stampWindowsResources(helperExePath, { required })
  if (process.exitCode) {
    process.exit()
  }
  console.log(`[build-smtc-helper] built ${helperExePath}`)
}

function stampWindowsResources(exePath, options = {}) {
  const shouldFail = options.required ?? required

  let ResEdit
  try {
    ResEdit = require('resedit')
  } catch (error) {
    warnAndSkip(`resedit is unavailable: ${error.message}`, shouldFail)
    return
  }

  try {
    const version = normalizeVersion(packageJson.version)
    const data = fs.readFileSync(exePath)
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
        InternalName: 'LUO Music SMTC Helper',
        OriginalFilename: 'smtc-helper.exe',
        ProductName: 'LUO Music'
      },
      true
    )
    versionInfo.outputToResourceEntries(res.entries)

    if (fs.existsSync(helperIconPath)) {
      const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(helperIconPath))
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1,
        language.lang,
        iconFile.icons.map(item => item.data)
      )
    }

    res.outputResource(exe)
    fs.writeFileSync(exePath, Buffer.from(exe.generate()))
    console.log(`[build-smtc-helper] stamped Windows resources in ${exePath}`)
  } catch (error) {
    warnAndSkip(
      `failed to stamp Windows resources: ${error.message}. Close LUO Music and retry if this file is locked.`,
      shouldFail
    )
  }
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
