const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const projectRoot = process.cwd()
const whitelistPath = path.join(projectRoot, 'scripts/architecture-boundaries.whitelist.json')
const whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'))

const forbiddenElectronAliasPrefixes = [
  '@/components/',
  '@/composables/',
  '@/views/',
  '@/store/',
  '@/services/',
  '@/types/',
  '@/utils/player/',
  '@/platform/contracts/'
]

const forbiddenElectronResolvedPrefixes = [
  'src/components/',
  'src/composables/',
  'src/views/',
  'src/store/',
  'src/services/',
  'src/types/',
  'src/utils/player/',
  'src/platform/contracts/'
]

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue'])
const importPattern =
  /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

function listTrackedSourceFiles() {
  const output = execFileSync('git', ['ls-files'], { cwd: projectRoot, encoding: 'utf8' })
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => fs.existsSync(path.join(projectRoot, file)))
    .filter(file => sourceExtensions.has(path.extname(file)))
}

function hasWildcardMatch(specifier, rules) {
  return Object.keys(rules).some(rule => {
    if (rule.endsWith('/*')) {
      return specifier.startsWith(rule.slice(0, -1))
    }

    return specifier === rule
  })
}

function matchesRule(specifier, rule) {
  if (rule.endsWith('/*')) {
    return specifier.startsWith(rule.slice(0, -1))
  }

  return specifier === rule
}

function extractImports(file) {
  const source = fs.readFileSync(path.join(projectRoot, file), 'utf8')
  const imports = []
  let match

  while ((match = importPattern.exec(source)) !== null) {
    imports.push(match[1] || match[2] || match[3])
  }

  return imports
}

function resolveProjectPath(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return `src/${specifier.slice(2)}`
  }

  if (specifier === '@shared') {
    return 'packages/shared/index'
  }

  if (specifier.startsWith('@shared/')) {
    return `packages/shared/${specifier.slice('@shared/'.length)}`
  }

  if (specifier === '@plugin-sdk') {
    return 'packages/plugin-sdk/index'
  }

  if (specifier.startsWith('@plugin-sdk/')) {
    return `packages/plugin-sdk/${specifier.slice('@plugin-sdk/'.length)}`
  }

  if (!specifier.startsWith('.')) {
    return null
  }

  const resolved = path.normalize(path.join(path.dirname(fromFile), specifier))
  return toPosix(resolved)
}

function checkElectronImports(files, errors) {
  const electronFiles = files.filter(file => file.startsWith('electron/'))

  for (const file of electronFiles) {
    for (const specifier of extractImports(file)) {
      if (
        specifier.startsWith('@/') &&
        hasWildcardMatch(specifier, whitelist.allowedElectronImports)
      ) {
        continue
      }

      if (forbiddenElectronAliasPrefixes.some(prefix => specifier.startsWith(prefix))) {
        errors.push(`${file}: Electron code must not import renderer-private module "${specifier}"`)
        continue
      }

      const resolved = resolveProjectPath(file, specifier)
      if (!resolved) {
        continue
      }

      if (forbiddenElectronResolvedPrefixes.some(prefix => resolved.startsWith(prefix))) {
        errors.push(`${file}: Electron code must not import renderer-private module "${specifier}"`)
      }
    }
  }
}

function checkRootApiImports(files, errors) {
  const consumers = files.filter(
    file =>
      file.startsWith('src/') ||
      file.startsWith('electron/') ||
      file.startsWith('packages/') ||
      file.startsWith('server/')
  )

  for (const file of consumers) {
    for (const specifier of extractImports(file)) {
      const resolved = resolveProjectPath(file, specifier)
      if (!resolved) {
        continue
      }

      if (resolved === 'api' || resolved.startsWith('api/')) {
        errors.push(`${file}: do not import Vercel serverless handler "${specifier}" as a module`)
      }
    }
  }
}

function getFeatureRoot(file) {
  const match = file.match(/^src\/features\/([^/]+)\//)
  return match ? `src/features/${match[1]}` : null
}

function checkFeaturePublicApi(files, errors) {
  const featureFiles = files.filter(file => file.startsWith('src/features/'))

  for (const file of featureFiles) {
    const currentFeature = getFeatureRoot(file)
    if (!currentFeature) {
      continue
    }

    for (const specifier of extractImports(file)) {
      const resolved = resolveProjectPath(file, specifier)
      if (!resolved || !resolved.startsWith('src/features/')) {
        continue
      }

      const targetFeature = getFeatureRoot(resolved)
      if (!targetFeature || targetFeature === currentFeature) {
        continue
      }

      const publicEntries = whitelist.featurePublicAPI[targetFeature] || ['index.ts']
      const targetRelative = resolved.slice(`${targetFeature}/`.length)
      const allowed = publicEntries.some(entry => {
        const withoutExtension = entry.replace(/\.[^.]+$/, '')
        return targetRelative === entry || targetRelative === withoutExtension
      })

      if (!allowed) {
        errors.push(`${file}: import "${specifier}" through ${targetFeature}/index.ts public API`)
      }
    }
  }
}

function checkSharedImports(files, errors) {
  const sharedFiles = files.filter(file => file.startsWith('packages/shared/'))
  const forbiddenRules = whitelist.forbiddenSharedImports || []

  for (const file of sharedFiles) {
    for (const specifier of extractImports(file)) {
      if (forbiddenRules.some(rule => matchesRule(specifier, rule))) {
        errors.push(
          `${file}: packages/shared must not import runtime-specific module "${specifier}"`
        )
        continue
      }

      const resolved = resolveProjectPath(file, specifier)
      if (!resolved) {
        continue
      }

      if (
        resolved.startsWith('src/') ||
        resolved.startsWith('electron/') ||
        resolved.startsWith('server/') ||
        resolved.startsWith('api/')
      ) {
        errors.push(
          `${file}: packages/shared must not import project runtime module "${specifier}"`
        )
      }
    }
  }
}

const files = listTrackedSourceFiles()
const errors = []

checkElectronImports(files, errors)
checkRootApiImports(files, errors)
checkFeaturePublicApi(files, errors)
checkSharedImports(files, errors)

if (errors.length > 0) {
  console.error('Architecture boundary check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Architecture boundary check passed.')
