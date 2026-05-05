const path = require('node:path')
const fs = require('node:fs')
const { getProjectScopedWindowsProcesses } = require('./build/clean-targets.cjs')

const projectRoot = path.join(__dirname, '..')
const moduleName = 'better-sqlite3'
const stampFile = path.join(projectRoot, '.vite_cache', 'native', `${moduleName}-electron.json`)

function parseArgs(argv) {
  return {
    force: argv.includes('--force')
  }
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

function logTiming(label, startedAt, totalStartedAt) {
  const elapsed = Date.now() - startedAt
  const total = Date.now() - totalStartedAt
  console.log(
    `[rebuild-native-electron:timing] ${label}: ${formatDuration(elapsed)} (total ${formatDuration(total)})`
  )
  return elapsed
}

function measureSync(label, totalStartedAt, action) {
  const startedAt = Date.now()
  try {
    const result = action()
    logTiming(label, startedAt, totalStartedAt)
    return result
  } catch (error) {
    logTiming(`${label} failed`, startedAt, totalStartedAt)
    throw error
  }
}

async function measure(label, totalStartedAt, action) {
  const startedAt = Date.now()
  try {
    const result = await action()
    logTiming(label, startedAt, totalStartedAt)
    return result
  } catch (error) {
    logTiming(`${label} failed`, startedAt, totalStartedAt)
    throw error
  }
}

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

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function getNativeBinaryPath(modulePath) {
  return path.join(modulePath, 'build', 'Release', 'better_sqlite3.node')
}

function getNativeBinaryFingerprint(modulePath) {
  try {
    const stats = fs.statSync(getNativeBinaryPath(modulePath))
    return {
      nativeBinaryMtimeMs: Math.round(stats.mtimeMs),
      nativeBinarySize: stats.size
    }
  } catch {
    return null
  }
}

function createRebuildStamp({ electronVersion, moduleVersion, nativeBinaryFingerprint = null }) {
  const stamp = {
    arch: process.arch,
    electronVersion,
    moduleName,
    moduleVersion,
    platform: process.platform
  }

  return nativeBinaryFingerprint ? { ...stamp, ...nativeBinaryFingerprint } : stamp
}

function isSameStamp(left, right) {
  return (
    Boolean(left) &&
    left.arch === right.arch &&
    left.electronVersion === right.electronVersion &&
    left.moduleName === right.moduleName &&
    left.moduleVersion === right.moduleVersion &&
    left.platform === right.platform
  )
}

function shouldSkipRebuild({ expectedStamp, force, modulePath }) {
  if (force) {
    return false
  }

  const nativeBinaryFingerprint = getNativeBinaryFingerprint(modulePath)
  if (!nativeBinaryFingerprint) {
    return false
  }

  const storedStamp = readJsonFile(stampFile)
  return (
    isSameStamp(storedStamp, expectedStamp) &&
    storedStamp.nativeBinaryMtimeMs === nativeBinaryFingerprint.nativeBinaryMtimeMs &&
    storedStamp.nativeBinarySize === nativeBinaryFingerprint.nativeBinarySize
  )
}

async function main() {
  const startedAt = Date.now()
  const { force } = parseArgs(process.argv.slice(2))
  let rebuild
  try {
    ;({ rebuild } = require('@electron/rebuild'))
  } catch (error) {
    console.log('[rebuild-native-electron] @electron/rebuild not available, skipping')
    console.log(`[rebuild-native-electron:timing] total: ${formatDuration(Date.now() - startedAt)}`)
    return
  }

  const modulePath = path.join(projectRoot, 'node_modules', moduleName)
  try {
    require.resolve(modulePath)
  } catch {
    console.log('[rebuild-native-electron] better-sqlite3 not installed, skipping')
    console.log(`[rebuild-native-electron:timing] total: ${formatDuration(Date.now() - startedAt)}`)
    return
  }

  let electronVersion
  try {
    ;({ version: electronVersion } = require('electron/package.json'))
  } catch (error) {
    console.error('[rebuild-native-electron] failed to resolve installed electron version')
    throw error
  }

  const modulePackagePath = path.join(modulePath, 'package.json')
  const modulePackageJson = readJsonFile(modulePackagePath)
  const moduleVersion = modulePackageJson?.version
  if (typeof moduleVersion !== 'string') {
    throw new Error(`[rebuild-native-electron] failed to resolve ${moduleName} version`)
  }

  const expectedStamp = createRebuildStamp({ electronVersion, moduleVersion })

  const skipRebuild = measureSync('check native rebuild stamp', startedAt, () =>
    shouldSkipRebuild({ expectedStamp, force, modulePath })
  )
  if (skipRebuild) {
    console.log(
      `[rebuild-native-electron] ${moduleName} already rebuilt for Electron ${electronVersion}; skipping`
    )
    console.log(`[rebuild-native-electron:timing] total: ${formatDuration(Date.now() - startedAt)}`)
    return
  }

  measureSync('check running Electron processes', startedAt, ensureNoProjectElectronProcesses)

  console.log(`[rebuild-native-electron] rebuilding ${moduleName} for Electron`)
  await measure('electron rebuild better-sqlite3', startedAt, () =>
    rebuild({
      buildPath: projectRoot,
      electronVersion,
      force: true,
      onlyModules: [moduleName]
    })
  )
  measureSync('write native rebuild stamp', startedAt, () => {
    writeJsonFile(
      stampFile,
      createRebuildStamp({
        electronVersion,
        moduleVersion,
        nativeBinaryFingerprint: getNativeBinaryFingerprint(modulePath)
      })
    )
  })
  console.log('[rebuild-native-electron] rebuild complete')
  console.log(`[rebuild-native-electron:timing] total: ${formatDuration(Date.now() - startedAt)}`)
}

if (require.main === module) {
  main().catch(error => {
    console.error('[rebuild-native-electron] rebuild failed')
    console.error(error)
    process.exit(1)
  })
}

module.exports = {
  createRebuildStamp,
  getNativeBinaryFingerprint,
  getNativeBinaryPath,
  isSameStamp,
  main,
  parseArgs,
  shouldSkipRebuild
}
