const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const { cleanTargets } = require('./clean-targets.cjs')

const projectRoot = path.resolve(__dirname, '..', '..')

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...(options.env || {}) },
    shell: options.shell ?? false,
    stdio: 'inherit'
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`)
  }
}

function runAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...(options.env || {}) },
      shell: options.shell ?? false,
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} terminated by signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
        return
      }

      resolve()
    })
  })
}

function runNode(scriptPath, args = []) {
  run(process.execPath, [scriptPath, ...args], { shell: false })
}

function getNpmRunner() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      prefixArgs: [process.env.npm_execpath],
      shell: false
    }
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: [],
    shell: process.platform === 'win32'
  }
}

function getNpmCommandParts() {
  const runner = getNpmRunner()
  return [runner.command, ...runner.prefixArgs]
}

function npmRun(scriptName, args = []) {
  const runner = getNpmRunner()
  run(runner.command, [...runner.prefixArgs, 'run', scriptName, ...args], {
    shell: runner.shell
  })
}

function npmRunAsync(scriptName, args = []) {
  const runner = getNpmRunner()
  return runAsync(runner.command, [...runner.prefixArgs, 'run', scriptName, ...args], {
    shell: runner.shell
  })
}

function runWithEnv(envEntries, commandArgs) {
  runNode('scripts/run-with-env.cjs', [...envEntries, '--', ...commandArgs])
}

function runWithEnvAsync(envEntries, commandArgs) {
  return runAsync(process.execPath, ['scripts/run-with-env.cjs', ...envEntries, '--', ...commandArgs])
}

function clean(targets, options = {}) {
  cleanTargets(targets, options)
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

async function runParallel(label, tasks) {
  const entries = Object.entries(tasks)
  const startedAt = Date.now()
  console.log(`[run-target] ${label}: starting ${entries.map(([name]) => name).join(', ')}`)

  const results = await Promise.allSettled(
    entries.map(async ([name, task]) => {
      const taskStartedAt = Date.now()
      await task()
      console.log(`[run-target] ${label}:${name}: ${formatDuration(Date.now() - taskStartedAt)}`)
    })
  )

  const failures = results
    .map((result, index) => ({ result, name: entries[index][0] }))
    .filter(({ result }) => result.status === 'rejected')

  if (failures.length > 0) {
    const details = failures
      .map(({ name, result }) => {
        const reason = result.status === 'rejected' ? result.reason : null
        return `${name}: ${reason instanceof Error ? reason.message : String(reason)}`
      })
      .join('; ')
    throw new Error(`[run-target] ${label} failed: ${details}`)
  }

  console.log(`[run-target] ${label}: completed in ${formatDuration(Date.now() - startedAt)}`)
}

const workflows = {
  async build() {
    clean(['build'])
    npmRun('guard:configs')
    await runParallel('build', {
      'rebuild:native': () => npmRunAsync('rebuild:native'),
      'electron-vite:build': () => npmRunAsync('electron-vite:build')
    })
  },

  async web() {
    clean(['dist', 'build/service'])
    npmRun('guard:configs')
    await runParallel('web', {
      'build:server': () => npmRunAsync('build:server'),
      'vp build': () =>
        runWithEnvAsync(
          ['APP_RUNTIME=web'],
          [
            ...getNpmCommandParts(),
            'run',
            'vp',
            '--',
            'build',
            '--config',
            '.config/vite.config.ts',
            '--mode',
            'web'
          ]
        )
    })
  },

  async 'electron-bundle'() {
    clean(['build'], { force: true })
    await workflows['electron-bundle-no-clean']()
  },

  async 'electron-bundle-no-clean'() {
    npmRun('guard:configs')
    await runParallel('electron-bundle', {
      'rebuild:native': () => npmRunAsync('rebuild:native'),
      'build:qq-runtime': () => npmRunAsync('build:qq-runtime'),
      'build:server': () => npmRunAsync('build:server'),
      'electron-vite:build': () => npmRunAsync('electron-vite:build')
    })
  },

  async electron() {
    clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
    await workflows['electron-bundle']()
    npmRun('electron-forge', ['--', 'make'])
  },

  async 'electron-portable'() {
    clean(['out/portable'], { force: true })
    await workflows['electron-bundle']()
    npmRun('electron-builder', ['--', '--config', 'electron/builder.portable.cjs', '--publish', 'never'])
    runNode('scripts/build/finalize-portable-output.cjs', ['out/portable'])
  },

  async package() {
    clean(['out/LUO Music-win32-x64'], { force: true })
    await workflows['electron-bundle']()
    npmRun('electron-forge', ['--', 'package'])
  },

  async make() {
    await workflows.electron()
  },

  async 'make-fast'() {
    clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
    await workflows['electron-bundle']()
    await runWithEnvAsync(
      ['LUO_FAST_MAKE=1'],
      [...getNpmCommandParts(), 'run', 'electron-forge', '--', 'make']
    )
  }
}

async function main() {
  const target = process.argv[2]
  const workflow = workflows[target]

  if (!workflow) {
    const availableTargets = Object.keys(workflows).sort().join(', ')
    throw new Error(`Unknown build target "${target}". Available targets: ${availableTargets}`)
  }

  await workflow()
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

module.exports = {
  formatDuration,
  runParallel,
  workflows
}
