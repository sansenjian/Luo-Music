const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')
const args = new Set(process.argv.slice(2))
const isRelease = args.has('--release')
const copyResource = args.has('--copy-resource')
const required = args.has('--required')
const targetProfile = isRelease ? 'release' : 'debug'
const helperFileName = getScannerFileName(process.platform)
const manifestPath = path.join(projectRoot, 'native', 'local-library-scanner', 'Cargo.toml')
const scannerPath = path.join(
  projectRoot,
  'native',
  'local-library-scanner',
  'target',
  targetProfile,
  helperFileName
)
const packagedNativeDir = path.join(projectRoot, 'build', 'native')
const packagedScannerPath = path.join(packagedNativeDir, helperFileName)

function warnAndSkip(message, shouldFail = required) {
  console.warn(`[build-local-library-scanner] ${message}`)
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

function getScannerFileName(platform = process.platform) {
  return platform === 'win32' ? 'local-library-scanner.exe' : 'local-library-scanner'
}

function ensureExecutableModeIfNeeded(filePath) {
  if (process.platform === 'win32') {
    return
  }

  try {
    const mode = fs.statSync(filePath).mode
    fs.chmodSync(filePath, mode | 0o755)
  } catch (error) {
    warnAndSkip(`failed to mark scanner executable: ${error.message}`)
  }
}

if (!fs.existsSync(manifestPath)) {
  warnAndSkip(`missing Cargo manifest: ${manifestPath}`)
  process.exit()
}

const cargoCommand = resolveCargoCommand()
const cargoArgs = ['build', '--manifest-path', manifestPath]
if (isRelease) {
  cargoArgs.push('--release')
}

console.log(`[build-local-library-scanner] ${cargoCommand} ${cargoArgs.join(' ')}`)
const result = spawnSync(cargoCommand, cargoArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
})

if (result.error) {
  warnAndSkip(
    `failed to start cargo: ${result.error.message}. Install Rust or set CARGO to ${path.basename(
      cargoCommand
    )}.`
  )
  process.exit()
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1
  process.exit()
}

if (!fs.existsSync(scannerPath)) {
  warnAndSkip(`cargo finished, but scanner was not found at ${scannerPath}`)
  process.exit()
}

if (copyResource) {
  fs.mkdirSync(packagedNativeDir, { recursive: true })
  fs.copyFileSync(scannerPath, packagedScannerPath)
  ensureExecutableModeIfNeeded(packagedScannerPath)
  if (process.exitCode) {
    process.exit()
  }
  console.log(`[build-local-library-scanner] copied ${packagedScannerPath}`)
} else {
  ensureExecutableModeIfNeeded(scannerPath)
  if (process.exitCode) {
    process.exit()
  }
  console.log(`[build-local-library-scanner] built ${scannerPath}`)
}
