const path = require('node:path')
const { getProjectScopedWindowsProcesses } = require('./build/clean-targets.cjs')

function ensureNoProjectElectronProcesses() {
  const processes = getProjectScopedWindowsProcesses()
  if (processes.length === 0) {
    return
  }

  console.error('[rebuild-native-electron] detected running Electron processes from this project:')
  for (const processInfo of processes) {
    console.error(`  - ${processInfo.Name} (PID ${processInfo.ProcessId})`)
  }
  throw new Error('Please close LUO Music / Electron processes before rebuilding native modules')
}

async function main() {
  let rebuild
  try {
    ;({ rebuild } = require('@electron/rebuild'))
  } catch (error) {
    console.log('[rebuild-native-electron] @electron/rebuild not available, skipping')
    return
  }

  const modulePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3')
  try {
    require.resolve(modulePath)
  } catch {
    console.log('[rebuild-native-electron] better-sqlite3 not installed, skipping')
    return
  }

  let electronVersion
  try {
    ;({ version: electronVersion } = require('electron/package.json'))
  } catch (error) {
    console.error('[rebuild-native-electron] failed to resolve installed electron version')
    throw error
  }

  ensureNoProjectElectronProcesses()

  console.log('[rebuild-native-electron] rebuilding better-sqlite3 for Electron')
  await rebuild({
    buildPath: path.join(__dirname, '..'),
    electronVersion,
    force: true,
    onlyModules: ['better-sqlite3']
  })
  console.log('[rebuild-native-electron] rebuild complete')
}

main().catch(error => {
  console.error('[rebuild-native-electron] rebuild failed')
  console.error(error)
  process.exit(1)
})
