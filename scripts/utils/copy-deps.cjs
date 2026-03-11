const fs = require('fs')
const path = require('path')

const DEFAULT_PATTERNS = [
  'axios',
  'follow-redirects',
  'form-data',
  'combined-stream',
  'delayed-stream',
  'asynckit',
  'es-set-tostringtag',
  'hasown',
  'mime-types',
  'mime-db',
  'es-object-atoms',
  'get-intrinsic',
  'get-proto',
  'call-bind-apply-helpers',
  'es-define-property',
  'es-errors',
  'function-bind',
  'gopd',
  'has-symbols',
  'has-tostringtag',
  'math-intrinsics',
  'dunder-proto'
]

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return
  }

  fs.rmSync(dirPath, { recursive: true, force: true })
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return false
  }

  const stat = fs.statSync(src)
  if (!stat.isDirectory()) {
    return false
  }

  ensureDir(dest)

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
      continue
    }

    if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(srcPath)
      const realStat = fs.statSync(realPath)
      if (realStat.isDirectory()) {
        copyDir(realPath, destPath)
      } else {
        ensureDir(path.dirname(destPath))
        fs.copyFileSync(realPath, destPath)
      }
      continue
    }

    ensureDir(path.dirname(destPath))
    fs.copyFileSync(srcPath, destPath)
  }

  return true
}

function resolveRootNodeModule(pkgName) {
  return path.join(process.cwd(), 'node_modules', pkgName)
}

function findResourcesDir(startDir) {
  const queue = [startDir]

  while (queue.length) {
    const currentDir = queue.shift()
    if (!currentDir || !fs.existsSync(currentDir)) {
      continue
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const entryPath = path.join(currentDir, entry.name)
      if (entry.name === 'resources' && fs.existsSync(path.join(entryPath, 'app.asar'))) {
        return entryPath
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push(path.join(currentDir, entry.name))
      }
    }
  }

  return null
}

function copyPackages(targetNodeModulesDir) {
  ensureDir(targetNodeModulesDir)

  const copied = []
  const missing = []

  for (const pkgName of DEFAULT_PATTERNS) {
    const srcPath = resolveRootNodeModule(pkgName)
    const destPath = path.join(targetNodeModulesDir, pkgName)

    removeDir(destPath)

    const ok = copyDir(srcPath, destPath)
    if (ok) {
      copied.push(pkgName)
    } else {
      missing.push(pkgName)
    }
  }

  console.log(`[copy-deps] target: ${targetNodeModulesDir}`)
  console.log(`[copy-deps] copied: ${copied.length ? copied.join(', ') : 'none'}`)
  console.log(`[copy-deps] missing: ${missing.length ? missing.join(', ') : 'none'}`)
}

function main() {
  const targetArg = process.argv[2]

  if (!targetArg) {
    console.error('Missing target resources directory or node_modules directory argument')
    process.exit(1)
  }

  const resolvedTarget = path.resolve(process.cwd(), targetArg)
  const targetNodeModulesDir = path.basename(resolvedTarget) === 'node_modules'
    ? resolvedTarget
    : path.join(resolvedTarget, 'node_modules')

  copyPackages(targetNodeModulesDir)

  const resourcesDir = findResourcesDir(path.resolve(process.cwd(), 'release_v3'))
  if (!resourcesDir) {
    console.log('[copy-deps] skip unpacked app sync: resources/app.asar not found')
    return
  }

  const unpackedAppRoot = path.join(resourcesDir, 'app.asar.unpacked', 'app')
  const unpackedNodeModulesDir = path.join(unpackedAppRoot, 'node_modules')
  copyPackages(unpackedNodeModulesDir)
}

main()
