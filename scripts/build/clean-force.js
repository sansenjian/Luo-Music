/**
 * 强制清理脚本 - Windows 优化版
 * 处理 Electron 构建产物的文件锁定问题
 */

import { rmSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const projectRoot = resolve(import.meta.dirname || '.', '..', '..')

// 要清理的目录（按依赖顺序排序，先删子目录）
const dirsToClean = [
  'out', // Electron Forge 默认输出目录
  'build',
  'dist-electron',
  'dist-server',
  'dist',
  '.vite',
  'node_modules/.vite',
  'node_modules/.cache'
]

const cleanAll = process.argv.includes('--all')

function setTimeoutSync(ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    // 阻塞等待
  }
}

// 步骤 1：强制结束占用进程
function killLockingProcesses() {
  console.log('正在结束占用进程...')

  const processes = ['electron.exe', 'LUO Music.exe']

  for (const proc of processes) {
    try {
      execSync(`taskkill /F /IM ${proc} 2>nul`, { stdio: 'ignore' })
      console.log(`  ✓ 已结束 ${proc}`)
    } catch {
      // 进程不存在，忽略错误
    }
  }

  // 等待进程完全释放句柄
  setTimeoutSync(500)
}

// 步骤 2：Windows 安全删除（重命名策略）
function windowsForceRemove(dirPath) {
  if (!existsSync(dirPath)) return true

  // 策略 A：直接删除
  try {
    rmSync(dirPath, { recursive: true, force: true })
    return true
  } catch {
    // 继续尝试其他策略
  }

  // 策略 B：先重命名再删除（绕过文件锁定）
  const tempName = `${dirPath}.old.${Date.now()}`
  try {
    renameSync(dirPath, tempName)
    rmSync(tempName, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return true
  } catch (err) {
    console.error(`  ✗ 无法删除: ${dirPath}`)
    console.error(`    错误: ${err.message}`)
    return false
  }
}

// 主流程
console.log('🧹 强制清理构建产物...\n')

// 先杀进程（如果加了 --force 参数）
if (process.argv.includes('--force')) {
  killLockingProcesses()
}

const failed = []

for (const dir of dirsToClean) {
  const fullPath = resolve(projectRoot, dir)
  process.stdout.write(`清理 ${dir}... `)

  if (!existsSync(fullPath)) {
    console.log('跳过')
    continue
  }

  if (windowsForceRemove(fullPath)) {
    console.log('✓')
  } else {
    console.log('✗')
    failed.push(dir)
  }
}

// 处理 --all（删除 node_modules）
if (cleanAll) {
  console.log('\n清理 node_modules（这可能需要几分钟）...')
  const nmPath = resolve(projectRoot, 'node_modules')
  if (windowsForceRemove(nmPath)) {
    console.log('✓ node_modules 已删除')
  } else {
    console.log('✗ node_modules 删除失败，建议手动删除或使用 rimraf')
    failed.push('node_modules')
  }
}

// 输出结果
console.log('\n' + '='.repeat(40))
if (failed.length === 0) {
  console.log('✅ 清理完成，可以重新构建了')
} else {
  console.log('⚠️  以下目录清理失败:')
  failed.forEach(d => console.log(`   - ${d}`))
  console.log('\n💡 提示：')
  console.log('   1. 关闭所有 VS Code / 终端窗口')
  console.log('   2. 检查系统托盘是否有残留 Electron 图标')
  console.log('   3. 重启资源管理器: taskkill /f /im explorer.exe && start explorer')
  console.log('   4. 或使用 --force 参数自动结束进程')
  process.exit(1)
}
