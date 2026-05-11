const { spawnSync } = require('node:child_process')
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

function runWithEnv(envEntries, commandArgs) {
  runNode('scripts/run-with-env.cjs', [...envEntries, '--', ...commandArgs])
}

function clean(targets, options = {}) {
  cleanTargets(targets, options)
}

const workflows = {
  build() {
    clean(['build'])
    npmRun('rebuild:native')
    npmRun('guard:configs')
    npmRun('electron-vite:build')
  },

  web() {
    clean(['dist', 'build/service'])
    npmRun('guard:configs')
    npmRun('build:server')
    runWithEnv(
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
  },

  'electron-bundle'() {
    clean(['build'], { force: true })
    npmRun('build:electron:bundle:no-clean')
  },

  'electron-bundle-no-clean'() {
    npmRun('rebuild:native')
    npmRun('guard:configs')
    npmRun('build:qq-runtime')
    npmRun('build:server')
    npmRun('electron-vite:build')
  },

  electron() {
    clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
    npmRun('build:electron:bundle')
    npmRun('electron-forge', ['--', 'make'])
  },

  'electron-portable'() {
    clean(['out/portable'], { force: true })
    npmRun('build:electron:bundle')
    npmRun('electron-builder', ['--', '--config', 'electron/builder.portable.cjs', '--publish', 'never'])
    runNode('scripts/build/finalize-portable-output.cjs', ['out/portable'])
  },

  package() {
    clean(['out/LUO Music-win32-x64'], { force: true })
    npmRun('build:electron:bundle')
    npmRun('electron-forge', ['--', 'package'])
  },

  make() {
    workflows.electron()
  },

  'make-fast'() {
    clean(['out/LUO Music-win32-x64', 'out/make'], { force: true })
    npmRun('build:electron:bundle')
    runWithEnv(['LUO_FAST_MAKE=1'], [...getNpmCommandParts(), 'run', 'electron-forge', '--', 'make'])
  }
}

function main() {
  const target = process.argv[2]
  const workflow = workflows[target]

  if (!workflow) {
    const availableTargets = Object.keys(workflows).sort().join(', ')
    throw new Error(`Unknown build target "${target}". Available targets: ${availableTargets}`)
  }

  workflow()
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = {
  workflows
}
