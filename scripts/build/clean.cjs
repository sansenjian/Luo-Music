const { cleanTargets } = require('./clean-targets.cjs')

const DEFAULT_CLEAN_TARGETS = [
  'build',
  'dist',
  'dist-electron',
  'dist-server',
  'out',
  'release',
  'release_v2',
  '.vite',
  '.vite_cache',
  'node_modules/.vite',
  'node_modules/.cache'
]

function parseCleanArgs(argv) {
  const all = argv.includes('--all')
  const force = argv.includes('--force')
  const explicitTargets = argv.filter(argument => !argument.startsWith('--'))
  const targets = explicitTargets.length > 0 ? explicitTargets : [...DEFAULT_CLEAN_TARGETS]

  if (all && !targets.includes('node_modules')) {
    targets.push('node_modules')
  }

  return {
    force,
    targets
  }
}

function main() {
  const { force, targets } = parseCleanArgs(process.argv.slice(2))
  cleanTargets(targets, { force })
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
  DEFAULT_CLEAN_TARGETS,
  parseCleanArgs
}
