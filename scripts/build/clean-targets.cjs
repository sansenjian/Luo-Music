const { existsSync, renameSync, rmSync } = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..', '..')
const WINDOWS_LOCKING_PROCESS_NAMES = new Set(['electron.exe', 'luo music.exe'])

function setTimeoutSync(ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    // busy wait for short Windows handle-release windows
  }
}

function killLockingProcesses() {
  if (process.platform !== 'win32') {
    return
  }

  console.log('正在结束占用进程...')
  const processes = getProjectScopedWindowsProcesses()

  if (processes.length === 0) {
    console.log('  ℹ 未发现当前项目的 Electron 进程')
    return
  }

  let killedProcessCount = 0

  for (const proc of processes) {
    try {
      execFileSync('taskkill', ['/F', '/PID', String(proc.ProcessId)], { stdio: 'ignore' })
      console.log(`  ✓ 已结束 ${proc.Name} (PID ${proc.ProcessId})`)
      killedProcessCount += 1
    } catch {
      // ignore when the process exits before taskkill runs
    }
  }

  if (killedProcessCount > 0) {
    setTimeoutSync(500)
  }
}

function normalizeWindowsProcessText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseWindowsProcessList(rawOutput) {
  const trimmedOutput = typeof rawOutput === 'string' ? rawOutput.trim() : ''

  if (trimmedOutput.length === 0) {
    return []
  }

  const parsed = JSON.parse(trimmedOutput)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function isProjectScopedWindowsProcess(processInfo, projectRootPath = projectRoot) {
  if (!processInfo || typeof processInfo !== 'object') {
    return false
  }

  const processName = normalizeWindowsProcessText(processInfo.Name).toLowerCase()
  if (!WINDOWS_LOCKING_PROCESS_NAMES.has(processName)) {
    return false
  }

  const normalizedProjectRoot = projectRootPath.toLowerCase()
  const executablePath = normalizeWindowsProcessText(processInfo.ExecutablePath).toLowerCase()
  const commandLine = normalizeWindowsProcessText(processInfo.CommandLine).toLowerCase()

  return executablePath.includes(normalizedProjectRoot) || commandLine.includes(normalizedProjectRoot)
}

function getProjectScopedWindowsProcesses() {
  const powershellScript = [
    "$targetNames = @('electron.exe', 'LUO Music.exe')",
    'Get-CimInstance Win32_Process',
    '  | Where-Object { $targetNames -contains $_.Name }',
    '  | Select-Object ProcessId, Name, CommandLine, ExecutablePath',
    '  | ConvertTo-Json -Compress'
  ].join('\n')

  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', powershellScript], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })

    return parseWindowsProcessList(output).filter(processInfo =>
      isProjectScopedWindowsProcess(processInfo)
    )
  } catch (error) {
    console.warn(
      `  ⚠ 无法枚举占用进程: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
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
  getProjectScopedWindowsProcesses,
  isProjectScopedWindowsProcess,
  parseWindowsProcessList,
  resolveCleanupTargets
}
