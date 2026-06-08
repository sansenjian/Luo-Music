const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const helperManifestPath = path.join(projectRoot, 'native', 'audio-output-helper', 'Cargo.toml')
const testName = 'exclusive_lock_probe_blocks_second_wasapi_client'

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
  console.warn('[audio-output-exclusive-lock] skipping: WASAPI exclusive mode is Windows-only')
  process.exit(0)
}

if (!fs.existsSync(helperManifestPath)) {
  console.error(`[audio-output-exclusive-lock] missing Cargo manifest: ${helperManifestPath}`)
  process.exit(1)
}

const cargoCommand = resolveCargoCommand()
const cargoArgs = [
  'test',
  '--manifest-path',
  helperManifestPath,
  testName,
  '--',
  '--ignored',
  '--nocapture'
]

console.log(`[audio-output-exclusive-lock] ${cargoCommand} ${cargoArgs.join(' ')}`)
const result = spawnSync(cargoCommand, cargoArgs, {
  cwd: projectRoot,
  env: process.env,
  shell: false,
  stdio: 'inherit'
})

if (result.error) {
  console.error(
    `[audio-output-exclusive-lock] failed to start cargo: ${result.error.message}. Install Rust or set CARGO to cargo.exe.`
  )
  process.exit(1)
}

process.exit(result.status ?? 1)
