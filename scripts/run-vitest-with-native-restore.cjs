const { spawn } = require('node:child_process')
const { getProjectScopedWindowsProcesses } = require('./build/clean-targets.cjs')

function getNpmRunner(options = {}) {
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath
  const execPath = options.execPath ?? process.execPath
  const platform = options.platform ?? process.platform

  if (npmExecPath) {
    return {
      command: execPath,
      prefixArgs: [npmExecPath],
      needsShell: false
    }
  }

  return {
    command: platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: [],
    needsShell: platform === 'win32'
  }
}

function createVpTestCommand(args, options = {}) {
  const runner = getNpmRunner(options)

  return {
    command: runner.command,
    args: [...runner.prefixArgs, 'run', 'vp', '--', 'test', ...args],
    shell: runner.needsShell
  }
}

function runCommand(command, args, label, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: options.shell === true
    })

    child.once('error', error => {
      console.error(`[run-vitest-with-native-restore] failed to start ${label}`)
      console.error(error)
      resolve({
        code: 1,
        signal: null
      })
    })

    child.once('exit', (code, signal) => {
      resolve({
        code: typeof code === 'number' ? code : 1,
        signal: signal ?? null
      })
    })
  })
}

function ensureNoProjectElectronProcesses(phaseLabel) {
  const processes = getProjectScopedWindowsProcesses()
  if (processes.length === 0) {
    return true
  }

  console.error(
    `[run-vitest-with-native-restore] close LUO Music / Electron before ${phaseLabel}; the native module is currently locked by:`
  )
  for (const processInfo of processes) {
    console.error(`  - ${processInfo.Name} (PID ${processInfo.ProcessId})`)
  }

  return false
}

function isTruthyEnv(name) {
  const value = process.env[name]
  return value === '1' || value === 'true' || value === 'yes'
}

async function runNpmCommand(args, label) {
  const runner = getNpmRunner()
  const result = await runCommand(runner.command, [...runner.prefixArgs, ...args], label, {
    shell: runner.needsShell
  })
  if (result.signal) {
    console.error(`[run-vitest-with-native-restore] ${label} terminated by signal ${result.signal}`)
    return 1
  }

  return result.code
}

async function main() {
  const vitestArgs = process.argv.slice(2)
  const skipNativeRebuild = isTruthyEnv('LUO_TEST_SKIP_NATIVE_REBUILD')
  const skipNativeRestore = isTruthyEnv('LUO_TEST_SKIP_NATIVE_RESTORE')

  if (skipNativeRebuild) {
    console.log('[run-vitest-with-native-restore] skipping Node native rebuild')
  } else {
    if (!ensureNoProjectElectronProcesses('switching better-sqlite3 to the Node test runtime')) {
      process.exit(1)
    }

    console.log('[run-vitest-with-native-restore] rebuilding better-sqlite3 for Node test runtime')
    const prepareCode = await runNpmCommand(['run', 'rebuild:native:node'], 'rebuild:native:node')
    if (prepareCode !== 0) {
      process.exit(prepareCode)
    }
  }

  let testCode = 1
  try {
    const vpTestCommand = createVpTestCommand(vitestArgs)
    testCode = await runCommand(vpTestCommand.command, vpTestCommand.args, 'vp test', {
      shell: vpTestCommand.shell
    }).then(result => {
      if (result.signal) {
        console.error(
          `[run-vitest-with-native-restore] vp test terminated by signal ${result.signal}`
        )
        return 1
      }

      return result.code
    })
  } finally {
    if (skipNativeRestore) {
      console.log('[run-vitest-with-native-restore] skipping Electron native restore')
      process.exit(testCode)
    }

    if (!ensureNoProjectElectronProcesses('restoring better-sqlite3 to the Electron runtime')) {
      process.exit(1)
    }

    console.log('[run-vitest-with-native-restore] restoring better-sqlite3 for Electron runtime')
    const restoreCode = await runNpmCommand(['run', 'rebuild:native'], 'rebuild:native')
    if (restoreCode !== 0) {
      process.exit(restoreCode)
    }
  }

  process.exit(testCode)
}

if (require.main === module) {
  main().catch(error => {
    console.error('[run-vitest-with-native-restore] unexpected failure')
    console.error(error)
    process.exit(1)
  })
}

module.exports = {
  createVpTestCommand,
  getNpmRunner,
  isTruthyEnv
}
