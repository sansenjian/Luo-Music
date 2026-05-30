const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
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

function runNodeAsync(scriptPath, args = []) {
  return runAsync(process.execPath, [scriptPath, ...args], { shell: false })
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
  return runAsync(process.execPath, [
    'scripts/run-with-env.cjs',
    ...envEntries,
    '--',
    ...commandArgs
  ])
}

function clean(targets, options = {}) {
  cleanTargets(targets, options)
}

function toBuildTargetPath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, '/')
}

function getElectronBundleCleanTargets() {
  const targets = ['build/assets', 'build/electron']
  const buildDir = path.join(projectRoot, 'build')
  const preservedBuildEntries = new Set(['runtime', 'service'])

  if (fs.existsSync(buildDir)) {
    for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
      if (!preservedBuildEntries.has(entry.name)) {
        targets.push(toBuildTargetPath(path.join(buildDir, entry.name)))
      }
    }
  }

  return [...new Set(targets)]
}

function packageThirdPartyPlugins() {
  return runNodeAsync('scripts/build/package-third-party-plugins.cjs')
}

function checkArtifactBudgets(profiles) {
  return runNodeAsync(
    'scripts/build/check-artifact-budgets.cjs',
    profiles.flatMap(profile => ['--profile', profile])
  )
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

async function runStep(label, task) {
  const startedAt = Date.now()
  console.log(`[run-target] ${label}: starting`)

  try {
    await task()
  } catch (error) {
    console.log(`[run-target] ${label}: failed after ${formatDuration(Date.now() - startedAt)}`)
    throw error
  }

  console.log(`[run-target] ${label}: completed in ${formatDuration(Date.now() - startedAt)}`)
}

function createWorkflows(overrides = {}) {
  const deps = {
    clean,
    checkArtifactBudgets,
    getElectronBundleCleanTargets,
    getNpmCommandParts,
    npmRun,
    npmRunAsync,
    packageThirdPartyPlugins,
    runNode,
    runNodeAsync,
    runParallel,
    runStep,
    runWithEnvAsync,
    ...overrides
  }

  const workflows = {
    async build() {
      await deps.runStep('build:clean', () => deps.clean(['build']))
      await deps.runStep('build:guard:configs', () => deps.npmRun('guard:configs'))
      await deps.runParallel('build', {
        'rebuild:native': () => deps.npmRunAsync('rebuild:native'),
        'electron-vite:build': () => deps.npmRunAsync('electron-vite:build')
      })
    },

    async web() {
      await deps.runStep('web:clean', () => deps.clean(['dist', 'build/service']))
      await deps.runStep('web:guard:configs', () => deps.npmRun('guard:configs'))
      await deps.runParallel('web', {
        'build:server': () => deps.npmRunAsync('build:server'),
        'vp build': () =>
          deps.runWithEnvAsync(
            ['APP_RUNTIME=web'],
            [
              ...deps.getNpmCommandParts(),
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
      await deps.runStep('electron-bundle:clean', () =>
        deps.clean(deps.getElectronBundleCleanTargets(), { force: true })
      )
      await workflows['electron-bundle-no-clean']()
    },

    async 'electron-bundle-no-clean'() {
      await deps.runStep('electron-bundle:guard:configs', () => deps.npmRun('guard:configs'))
      await deps.runParallel('electron-bundle', {
        'rebuild:native': () => deps.npmRunAsync('rebuild:native'),
        'build:qq-runtime': () => deps.npmRunAsync('build:qq-runtime'),
        'build:server': () => deps.npmRunAsync('build:server'),
        'electron-vite:build': () => deps.npmRunAsync('electron-vite:build')
      })
    },

    async electron() {
      await deps.runStep('electron:clean', () =>
        deps.clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
      )
      await buildElectronArtifacts('electron')
      await deps.runStep('electron:make', () => deps.npmRun('electron-forge', ['--', 'make']))
      await checkPackagingBudgets('electron', ['bundle', 'plugins', 'electron'])
    },

    async 'electron-portable'() {
      await deps.runStep('electron-portable:clean', () =>
        deps.clean(['out/portable'], { force: true })
      )
      await buildElectronArtifacts('electron-portable')
      await deps.runStep('electron-portable:build', () =>
        deps.npmRun('electron-builder', [
          '--',
          '--config',
          'electron/builder.portable.cjs',
          '--publish',
          'never'
        ])
      )
      await deps.runStep('electron-portable:finalize', () =>
        deps.runNode('scripts/build/finalize-portable-output.cjs', ['out/portable'])
      )
      await checkPackagingBudgets('electron-portable', ['bundle', 'plugins', 'portable'])
    },

    async package() {
      await deps.runStep('package:clean', () =>
        deps.clean(['out/LUO Music-win32-x64'], { force: true })
      )
      await buildElectronArtifacts('package')
      await deps.runStep('package:forge', () => deps.npmRun('electron-forge', ['--', 'package']))
      await checkPackagingBudgets('package', ['bundle', 'plugins', 'package'])
    },

    async make() {
      await workflows.electron()
    },

    async 'electron-all'() {
      await deps.runStep('electron-all:clean', () =>
        deps.clean(['out/LUO Music-win32-x64', 'out/make', 'out/portable'], { force: true })
      )
      await buildElectronArtifacts('electron-all')
      await deps.runParallel('electron-all:package', {
        'electron-forge:make': () => deps.npmRunAsync('electron-forge', ['--', 'make']),
        'electron-builder:portable': async () => {
          await deps.npmRunAsync('electron-builder', [
            '--',
            '--config',
            'electron/builder.portable.cjs',
            '--publish',
            'never'
          ])
          await deps.runNodeAsync('scripts/build/finalize-portable-output.cjs', ['out/portable'])
        }
      })
      await checkPackagingBudgets('electron-all', ['bundle', 'plugins', 'electron', 'portable'])
    },

    async 'make-fast'() {
      await deps.runStep('make-fast:clean', () =>
        deps.clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
      )
      await buildElectronArtifacts('make-fast')
      await deps.runStep('make-fast:make', () =>
        deps.runWithEnvAsync(
          ['LUO_FAST_MAKE=1'],
          [...deps.getNpmCommandParts(), 'run', 'electron-forge', '--', 'make']
        )
      )
      await checkPackagingBudgets('make-fast', ['bundle', 'plugins', 'electron'])
    }
  }

  function checkPackagingBudgets(label, profiles) {
    return deps.runStep(`${label}:artifact-budgets`, () => deps.checkArtifactBudgets(profiles))
  }

  function buildElectronArtifacts(label) {
    return deps.runParallel(`${label}:prepare`, {
      'electron-bundle': () => workflows['electron-bundle'](),
      'package-third-party-plugins': () => deps.packageThirdPartyPlugins()
    })
  }

  return workflows
}

const workflows = createWorkflows()

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
  checkArtifactBudgets,
  createWorkflows,
  formatDuration,
  getElectronBundleCleanTargets,
  runParallel,
  runStep,
  workflows
}
