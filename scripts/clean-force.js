/**
 * 强制清理脚本
 * 用于删除构建产物、缓存目录和 node_modules
 * 在 Windows 上处理文件锁定和权限问题
 */

import { rmSync, existsSync } from 'fs'
import { resolve } from 'path'

// 获取项目根目录
const projectRoot = resolve(import.meta.dirname, '..')

// 要清理的目录列表
const dirsToClean = [
  'dist',
  'dist-electron',
  'dist-server',
  'release_v2',
  '.vite',
  'node_modules/.vite',
  'node_modules/.cache',
]

// 额外清理 node_modules（仅当传入 --all 参数时）
const cleanAll = process.argv.includes('--all')
if (cleanAll) {
  dirsToClean.push('node_modules')
}

/**
 * 强制删除目录
 * @param {string} dirPath - 目录路径
 */
function forceRemoveDir(dirPath) {
  if (!existsSync(dirPath)) {
    console.log(`跳过不存在的目录：${dirPath}`)
    return true
  }

  try {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    console.log(`已删除：${dirPath}`)
    return true
  } catch (err) {
    // Windows 上可能因文件锁定失败
    if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
      console.warn(`警告：无法删除 ${dirPath} - 文件可能被占用`)
      console.warn(`错误详情：${err.message}`)
      return false
    }
    throw err
  }
}

console.log('开始清理...')
console.log(`项目根目录：${projectRoot}\n`)

let success = true
for (const dir of dirsToClean) {
  const fullPath = resolve(projectRoot, dir)
  if (!forceRemoveDir(fullPath)) {
    success = false
  }
}

console.log('\n清理完成!')

if (!success) {
  console.log('\n提示：部分目录删除失败，可能需要关闭正在使用的程序后重试')
  process.exit(1)
}