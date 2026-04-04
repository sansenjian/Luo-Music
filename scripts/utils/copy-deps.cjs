const fs = require('fs')
const path = require('path')
const PROJECT_ROOT = process.cwd()

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

function ensurePathWithinBase(basePath, targetPath, label) {
  const resolvedBase = path.resolve(basePath)
  const resolvedTarget = path.resolve(targetPath)
  const relativePath = path.relative(resolvedBase, resolvedTarget)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${label} escapes base directory: ${resolvedTarget}`)
  }

  return resolvedTarget
}

function resolveChildPath(basePath, childPath, label) {
  if (typeof childPath !== 'string' || childPath.length === 0) {
    throw new Error(`Invalid ${label}`)
  }

  if (childPath.includes('\0') || path.isAbsolute(childPath)) {
    throw new Error(`Unsafe ${label}: ${childPath}`)
  }

  const normalizedPath = path.normalize(childPath)
  const segments = normalizedPath.split(path.sep)
  if (segments.includes('..')) {
    throw new Error(`Unsafe ${label}: ${childPath}`)
  }

  return ensurePathWithinBase(basePath, path.resolve(basePath, normalizedPath), label)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return
  }

  fs.rmSync(dirPath, { recursive: true, force: true })
}

function copyDir(src, dest, sourceRoot = src, destRoot = dest, visitedRealPaths = new Set()) {
  const resolvedSrc = ensurePathWithinBase(sourceRoot, src, 'source path')
  const resolvedDest = ensurePathWithinBase(destRoot, dest, 'destination path')

  if (!fs.existsSync(resolvedSrc)) {
    return false
  }

  const stat = fs.statSync(resolvedSrc)
  if (!stat.isDirectory()) {
    return false
  }

  ensureDir(resolvedDest)

  for (const entry of fs.readdirSync(resolvedSrc, { withFileTypes: true })) {
    const srcPath = resolveChildPath(resolvedSrc, entry.name, 'source entry')
    const destPath = resolveChildPath(resolvedDest, entry.name, 'destination entry')

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, sourceRoot, destRoot, visitedRealPaths)
      continue
    }

    if (entry.isSymbolicLink()) {
      let realPath
      try {
        realPath = fs.realpathSync(srcPath)
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
          console.warn(`[copy-deps] skip broken symlink: ${srcPath}`)
          continue
        }
        throw error
      }

      const safeRealPath = ensurePathWithinBase(sourceRoot, realPath, 'symlink target')
      if (visitedRealPaths.has(safeRealPath)) {
        continue
      }
      visitedRealPaths.add(safeRealPath)
      const realStat = fs.statSync(safeRealPath)
      if (realStat.isDirectory()) {
        copyDir(safeRealPath, destPath, sourceRoot, destRoot, visitedRealPaths)
      } else {
        ensureDir(path.dirname(destPath))
        fs.copyFileSync(safeRealPath, destPath)
      }
      continue
    }

    ensureDir(path.dirname(destPath))
    fs.copyFileSync(srcPath, destPath)
  }

  return true
}

function resolveRootNodeModule(pkgName) {
  return resolveChildPath(path.join(PROJECT_ROOT, 'node_modules'), pkgName, 'package name')
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

      const entryPath = resolveChildPath(currentDir, entry.name, 'resources entry')
      if (entry.name === 'resources' && fs.existsSync(path.join(entryPath, 'app.asar'))) {
        return entryPath
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push(resolveChildPath(currentDir, entry.name, 'resources entry'))
      }
    }
  }

  return null
}

function isDescendantOf(candidate, ancestor) {
  const relative = path.relative(ancestor, candidate)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function copyPackages(targetNodeModulesDir) {
  const safeTargetNodeModulesDir = ensurePathWithinBase(PROJECT_ROOT, targetNodeModulesDir, 'target node_modules directory')

  const projectNodeModules = path.join(PROJECT_ROOT, 'node_modules')
  if (safeTargetNodeModulesDir === projectNodeModules || isDescendantOf(safeTargetNodeModulesDir, projectNodeModules)) {
    console.error(`[copy-deps] ERROR: target ${safeTargetNodeModulesDir} is inside the project's own node_modules, aborting`)
    process.exit(1)
  }

  ensureDir(safeTargetNodeModulesDir)

  const copied = []
  const missing = []

  for (const pkgName of DEFAULT_PATTERNS) {
    const srcPath = resolveRootNodeModule(pkgName)
    const destPath = resolveChildPath(safeTargetNodeModulesDir, pkgName, 'package destination')

    if (isDescendantOf(destPath, srcPath) || isDescendantOf(srcPath, destPath)) {
      console.error(`[copy-deps] ERROR: src and dest paths overlap for ${pkgName}, aborting`)
      process.exit(1)
    }

    removeDir(destPath)

    const ok = copyDir(srcPath, destPath)
    if (ok) {
      copied.push(pkgName)
    } else {
      missing.push(pkgName)
    }
  }

  console.log(`[copy-deps] target: ${safeTargetNodeModulesDir}`)
  console.log(`[copy-deps] copied: ${copied.length ? copied.join(', ') : 'none'}`)
  console.log(`[copy-deps] missing: ${missing.length ? missing.join(', ') : 'none'}`)
}

function main() {
  const targetArg = process.argv[2]

  if (!targetArg) {
    console.error('Missing target resources directory or node_modules directory argument')
    process.exit(1)
  }

  const resolvedTarget = resolveChildPath(PROJECT_ROOT, targetArg, 'target path')
  const targetNodeModulesDir = path.basename(resolvedTarget) === 'node_modules'
    ? resolvedTarget
    : resolveChildPath(resolvedTarget, 'node_modules', 'target node_modules directory')

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
