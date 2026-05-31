const fs = require('node:fs/promises')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')

const MiB = 1024 * 1024
const DEFAULT_PROFILES = ['bundle', 'plugins']
const ARTIFACT_BUDGETS = {
  bundle: [
    { path: 'build', maxBytes: 80 * MiB },
    { path: 'build/assets', maxBytes: 25 * MiB },
    { path: 'build/electron', maxBytes: 15 * MiB },
    { path: 'build/service', maxBytes: 20 * MiB },
    { path: 'build/runtime', maxBytes: 15 * MiB }
  ],
  electron: [
    { path: 'out/LUO Music-win32-x64', maxBytes: 260 * MiB },
    { path: 'out/make', maxBytes: 260 * MiB }
  ],
  package: [{ path: 'out/LUO Music-win32-x64', maxBytes: 260 * MiB }],
  plugins: [{ path: 'out/third-party-plugins', maxBytes: 30 * MiB }],
  portable: [{ path: 'out/portable', maxBytes: 180 * MiB }]
}

function parseArgs(argv) {
  const profiles = []
  let strict = process.env.LUO_ARTIFACT_BUDGET_STRICT === '1'

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--profile') {
      const profile = argv[index + 1]
      if (profile) {
        profiles.push(profile)
      }
      index += 1
      continue
    }

    if (argument === '--strict') {
      strict = true
    }
  }

  return {
    profiles: profiles.length > 0 ? profiles : [...DEFAULT_PROFILES],
    strict
  }
}

function formatBytes(value) {
  if (value < MiB) {
    return `${(value / 1024).toFixed(1)} KiB`
  }

  return `${(value / MiB).toFixed(1)} MiB`
}

async function collectSize(absolutePath) {
  const stat = await fs.stat(absolutePath).catch(error => {
    if (error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (!stat) {
    return null
  }

  if (stat.isFile()) {
    return stat.size
  }

  if (!stat.isDirectory()) {
    return 0
  }

  const entries = await fs.readdir(absolutePath, { withFileTypes: true })
  const sizes = await Promise.all(
    entries.map(entry => collectSize(path.join(absolutePath, entry.name)))
  )

  return sizes.reduce((total, size) => total + (size ?? 0), 0)
}

function resolveBudgets(profiles) {
  const budgets = []
  const seenPaths = new Set()

  for (const profile of profiles) {
    const profileBudgets = ARTIFACT_BUDGETS[profile]
    if (!profileBudgets) {
      throw new Error(`Unknown artifact budget profile "${profile}"`)
    }

    for (const budget of profileBudgets) {
      if (seenPaths.has(budget.path)) {
        continue
      }

      seenPaths.add(budget.path)
      budgets.push(budget)
    }
  }

  return budgets
}

async function checkArtifactBudgets(options = {}) {
  const profiles = options.profiles ?? DEFAULT_PROFILES
  const strict = options.strict ?? process.env.LUO_ARTIFACT_BUDGET_STRICT === '1'
  const rootDir = options.rootDir ?? projectRoot
  const budgets = options.budgets ?? resolveBudgets(profiles)
  const results = []

  for (const budget of budgets) {
    const absolutePath = path.resolve(rootDir, budget.path)
    const size = await collectSize(absolutePath)

    results.push({
      ...budget,
      exists: size !== null,
      size: size ?? 0,
      withinBudget: size !== null && size <= budget.maxBytes
    })
  }

  const oversized = results.filter(result => !result.withinBudget)

  for (const result of results) {
    const status = result.withinBudget ? 'ok' : strict ? 'error' : 'warn'
    const sizeLabel = result.exists ? formatBytes(result.size) : 'missing'
    console.log(
      `[artifact-budget] ${status}: ${result.path} ${sizeLabel} / ${formatBytes(result.maxBytes)}`
    )
  }

  if (strict && oversized.length > 0) {
    throw new Error(
      `Artifact budget exceeded: ${oversized
        .map(
          result => `${result.path} ${formatBytes(result.size)} > ${formatBytes(result.maxBytes)}`
        )
        .join(', ')}`
    )
  }

  return results
}

async function main() {
  await checkArtifactBudgets(parseArgs(process.argv.slice(2)))
}

if (require.main === module) {
  main().catch(error => {
    console.error('[artifact-budget] Failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

module.exports = {
  ARTIFACT_BUDGETS,
  DEFAULT_PROFILES,
  checkArtifactBudgets,
  collectSize,
  formatBytes,
  parseArgs,
  resolveBudgets
}
