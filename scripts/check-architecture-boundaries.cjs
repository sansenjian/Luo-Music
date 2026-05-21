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

const allowedLocalLibraryNativeTests = new Set([
  'tests/electron/localLibrary.repository.test.ts',
  'tests/electron/localLibrary.service.test.ts'
])
const forbiddenLocalLibraryPureTestRuntimeImports = new Set(['better-sqlite3', 'node:sqlite'])
const allowedApiHttpRequestFiles = new Set([
  'src/api/qqmusic.ts',
  'src/api/shared/neteaseServiceRequest.ts'
])
const forbiddenServiceAccessorModules = new Set([
  'src/services/platformAccessor',
  'src/services/playerAccessor'
])
const allowedLocalStorageBoundaryFiles = new Set([
  'src/platform/web/webPlatformService.ts',
  'src/services/storageService.ts',
  'src/utils/storage/appStorage.ts'
])
const forbiddenPlatformDisplayClassPattern =
  /\b(?:service|server|platform)-badge[-.]?(?:netease|qq)\b/
const pluginFacadeCallPattern = /\.call\s*\([^,\n]+,\s*['"](?:auth|account|library)\./
const directLocalStoragePattern = /\b(?:window\.)?localStorage\s*(?:\.|\[)/
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue'])
const importPattern =
  /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

function listGitFiles(args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function listProjectSourceFiles() {
  const files = new Set([
    ...listGitFiles(['ls-files']),
    ...listGitFiles(['ls-files', '--others', '--exclude-standard'])
  ])

  return Array.from(files)
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

function extractImports(file, rootDir = projectRoot) {
  const source = fs.readFileSync(path.join(rootDir, file), 'utf8')
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

function stripSourceExtension(projectPath) {
  return projectPath.replace(/\.(?:[cm]?[tj]sx?|vue)$/, '')
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

function checkLocalLibraryNativeTestBoundaries(files, errors, rootDir = projectRoot) {
  const localLibraryTests = files.filter(file =>
    /^tests\/electron\/localLibrary.*\.test\.[cm]?[tj]sx?$/.test(file)
  )

  for (const file of localLibraryTests) {
    if (allowedLocalLibraryNativeTests.has(file)) {
      continue
    }

    for (const specifier of extractImports(file, rootDir)) {
      const resolved = resolveProjectPath(file, specifier)
      const resolvedWithoutExtension = resolved ? stripSourceExtension(resolved) : null
      const importsNativeRepository =
        resolvedWithoutExtension === 'electron/local-library/repository'
      const importsNativeRuntime = forbiddenLocalLibraryPureTestRuntimeImports.has(specifier)

      if (!importsNativeRepository && !importsNativeRuntime) {
        continue
      }

      errors.push(
        `${file}: pure local-library tests must not import native SQLite boundary "${specifier}"; use helper modules or move true SQLite coverage to test:native`
      )
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

function checkNeteaseApiRequestImports(files, errors, rootDir = projectRoot) {
  const apiFiles = files.filter(file => file.startsWith('src/api/'))

  for (const file of apiFiles) {
    if (allowedApiHttpRequestFiles.has(file)) {
      continue
    }

    for (const specifier of extractImports(file, rootDir)) {
      const resolved = resolveProjectPath(file, specifier)
      const resolvedWithoutExtension = resolved ? stripSourceExtension(resolved) : null
      const importsNeteaseRequestEntry =
        resolvedWithoutExtension === 'src/utils/http' ||
        resolvedWithoutExtension === 'src/utils/http/index'

      if (importsNeteaseRequestEntry) {
        errors.push(
          `${file}: Netease API modules should use src/api/shared/neteaseServiceRequest.ts instead of importing "@/utils/http" directly`
        )
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

function checkRendererHttpConstants(errors, rootDir = projectRoot) {
  const file = 'src/constants/http.ts'
  const sourcePath = path.join(rootDir, file)
  if (!fs.existsSync(sourcePath)) {
    return
  }

  const source = fs.readFileSync(sourcePath, 'utf8')
  if (/\bexport\s+const\s+(?:NETEASE_API_PORT|QQ_API_PORT)\b/.test(source)) {
    errors.push(
      `${file}: service port defaults belong in packages/shared/protocol/cache.ts, not renderer HTTP constants`
    )
  }
}

function checkLegacyServiceAccessorImports(files, errors, rootDir = projectRoot) {
  const productionFiles = files.filter(
    file =>
      (file.startsWith('src/') ||
        file.startsWith('electron/') ||
        file.startsWith('packages/') ||
        file.startsWith('server/')) &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx')
  )

  for (const file of productionFiles) {
    for (const specifier of extractImports(file, rootDir)) {
      const resolved = resolveProjectPath(file, specifier)
      const resolvedWithoutExtension = resolved ? stripSourceExtension(resolved) : null

      if (
        resolvedWithoutExtension &&
        forbiddenServiceAccessorModules.has(resolvedWithoutExtension)
      ) {
        errors.push(
          `${file}: use services.platform()/services.player() instead of legacy accessor "${specifier}"`
        )
      }
    }
  }
}

function checkTopLevelServiceAccess(files, errors, rootDir = projectRoot) {
  const monitoredFiles = files.filter(
    file =>
      (file.startsWith('src/api/') ||
        file.startsWith('src/store/') ||
        file.startsWith('src/composables/')) &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx')
  )

  for (const file of monitoredFiles) {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8')
    let braceDepth = 0
    const lines = source.split(/\r?\n/)

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      const depthBeforeLine = braceDepth

      if (
        depthBeforeLine === 0 &&
        /^\s*(?:export\s+)?(?:const|let|var)\s+\w+(?:\s*:\s*[^=]+)?\s*=\s*services\.\w+\(/.test(
          line
        )
      ) {
        errors.push(
          `${file}:${index + 1}: avoid caching services.xxx() at module top level; resolve inside a function or deps factory`
        )
      }

      for (const char of line.replace(/\/\/.*$/, '')) {
        if (char === '{') {
          braceDepth++
        } else if (char === '}') {
          braceDepth = Math.max(0, braceDepth - 1)
        }
      }
    }
  }
}

function checkPlatformDisplayClassHardcoding(files, errors, rootDir = projectRoot) {
  const productionFiles = files.filter(
    file => file.startsWith('src/') && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
  )

  for (const file of productionFiles) {
    const lines = fs.readFileSync(path.join(rootDir, file), 'utf8').split(/\r?\n/)

    for (let index = 0; index < lines.length; index++) {
      if (forbiddenPlatformDisplayClassPattern.test(lines[index])) {
        errors.push(
          `${file}:${index + 1}: use getPlatformDisplayInfo() for platform display classes instead of hardcoding built-in platform badge classes`
        )
      }
    }
  }
}

function checkPluginFacadeUsage(files, errors, rootDir = projectRoot) {
  const productionFiles = files.filter(
    file =>
      file.startsWith('src/') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx') &&
      file !== 'src/services/pluginService.ts'
  )

  for (const file of productionFiles) {
    const lines = fs.readFileSync(path.join(rootDir, file), 'utf8').split(/\r?\n/)

    for (let index = 0; index < lines.length; index++) {
      if (pluginFacadeCallPattern.test(lines[index])) {
        errors.push(
          `${file}:${index + 1}: use services.plugins().auth/account/library methods instead of direct plugin facade call strings`
        )
      }
    }
  }
}

function checkDirectLocalStorageUsage(files, errors, rootDir = projectRoot) {
  const productionFiles = files.filter(
    file =>
      file.startsWith('src/') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx') &&
      !allowedLocalStorageBoundaryFiles.has(file)
  )

  for (const file of productionFiles) {
    const lines = fs.readFileSync(path.join(rootDir, file), 'utf8').split(/\r?\n/)

    for (let index = 0; index < lines.length; index++) {
      const code = lines[index].replace(/\/\/.*$/, '')
      if (directLocalStoragePattern.test(code)) {
        errors.push(
          `${file}:${index + 1}: use services.storage() or a platform/storage boundary instead of direct localStorage access`
        )
      }
    }
  }
}

function runArchitectureBoundaryChecks() {
  const files = listProjectSourceFiles()
  const errors = []

  checkElectronImports(files, errors)
  checkLocalLibraryNativeTestBoundaries(files, errors)
  checkRootApiImports(files, errors)
  checkNeteaseApiRequestImports(files, errors)
  checkFeaturePublicApi(files, errors)
  checkSharedImports(files, errors)
  checkRendererHttpConstants(errors)
  checkLegacyServiceAccessorImports(files, errors)
  checkTopLevelServiceAccess(files, errors)
  checkPlatformDisplayClassHardcoding(files, errors)
  checkPluginFacadeUsage(files, errors)
  checkDirectLocalStorageUsage(files, errors)

  return errors
}

function main() {
  const errors = runArchitectureBoundaryChecks()

  if (errors.length > 0) {
    console.error('Architecture boundary check failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('Architecture boundary check passed.')
}

if (require.main === module) {
  main()
} else {
  module.exports = {
    checkLocalLibraryNativeTestBoundaries,
    checkLegacyServiceAccessorImports,
    checkNeteaseApiRequestImports,
    checkPlatformDisplayClassHardcoding,
    checkPluginFacadeUsage,
    checkPluginAuthFacadeUsage: checkPluginFacadeUsage,
    checkDirectLocalStorageUsage,
    checkRendererHttpConstants,
    checkTopLevelServiceAccess,
    extractImports,
    resolveProjectPath,
    runArchitectureBoundaryChecks
  }
}
