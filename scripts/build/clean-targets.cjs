const { existsSync, renameSync, rmSync } = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..', '..')

function setTimeoutSync(ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    // busy wait for short Windows handle-release windows
  }
}

function killLockingProcesses() {
  console.log('正在结束占用进程...')

  const processes = ['electron.exe', 'LUO Music.exe']

  for (const proc of processes) {
    try {
      execSync(`taskkill /F /IM "${proc}" 2>nul`, { stdio: 'ignore' })
      console.log(`  ✓ 已结束 ${proc}`)
    } catch {
      // ignore when the process is not running
    }
  }

  setTimeoutSync(500)
}

function isPathInsideProject(absolutePath) {
  const relativePath = path.relative(projectRoot, absolutePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function resolveCleanupTargets(targetArgs) {
  const uniqueTargets = [...new Set(targetArgs)]

  if (uniqueTargets.length === 0) {
    throw new Error('No cleanup targets were provided')
  }

  return uniqueTargets
    .map(targetPath => {
      const absolutePath = path.resolve(projectRoot, targetPath)

      if (!isPathInsideProject(absolutePath)) {
        throw new Error(`Refusing to clean path outside project root: ${targetPath}`)
      }

      return {
        targetPath,
        absolutePath
      }
    })
    .sort((left, right) => right.absolutePath.length - left.absolutePath.length)
}

function windowsForceRemove(targetPath) {
  if (!existsSync(targetPath)) {
    return true
  }

  let currentPath = targetPath
  let lastError = null

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      rmSync(currentPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      return true
    } catch (error) {
      lastError = error
    }

    if (!existsSync(currentPath)) {
      return true
    }

    const tempName = `${targetPath}.old.${Date.now()}.${attempt}`

    try {
      renameSync(currentPath, tempName)
      currentPath = tempName
      rmSync(currentPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      return true
    } catch (error) {
      lastError = error
      setTimeoutSync(300 * attempt)
    }
  }

  console.error(`  ✗ 无法删除: ${targetPath}`)
  console.error(`    错误: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  return false
}

function cleanTargets(targetArgs, options = {}) {
  const cleanupTargets = resolveCleanupTargets(targetArgs)
  const failedTargets = []

  console.log('🧹 定向清理构建产物...\n')

  if (options.force === true) {
    killLockingProcesses()
  }

  for (const { targetPath, absolutePath } of cleanupTargets) {
    process.stdout.write(`清理 ${targetPath}... `)

    if (!existsSync(absolutePath)) {
      console.log('跳过')
      continue
    }

    if (windowsForceRemove(absolutePath)) {
      console.log('✓')
      continue
    }

    console.log('✗')
    failedTargets.push(targetPath)
  }

  console.log('\n' + '='.repeat(40))

  if (failedTargets.length === 0) {
    console.log('✅ 定向清理完成')
    return
  }

  console.log('⚠️  以下目录清理失败:')
  failedTargets.forEach(targetPath => console.log(`   - ${targetPath}`))
  throw new Error(`Failed to clean ${failedTargets.join(', ')}`)
}

function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const targetArgs = args.filter(argument => argument !== '--force')

  cleanTargets(targetArgs, { force })
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : String(error)
    )
    process.exitCode = 1
  }
}

module.exports = {
  cleanTargets,
  resolveCleanupTargets
}
