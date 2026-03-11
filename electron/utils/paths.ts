import path from 'node:path'

// 使用 process.cwd() 获取项目根目录
// 这在开发环境和打包后都能正确工作
const projectRoot = process.cwd()

// 导出常用路径（均为项目根目录下的绝对路径）
export const BUILD_DIR = path.join(projectRoot, 'build')
export const MAIN_DIST = path.join(BUILD_DIR, 'electron')
export const RENDERER_DIST = BUILD_DIR
export const VITE_PUBLIC = process.env.VITE_PUBLIC || path.join(projectRoot, 'public')

// 项目根目录常量（推荐新项目使用 PROJECT_ROOT）
// 保留 __dirname 和 __filename 用于向后兼容，但语义上等同于项目根目录
export const PROJECT_ROOT = projectRoot

/**
 * 获取脚本目录的绝对路径
 * 开发环境：项目根目录下的 scripts/dev/
 * 打包后：应用资源目录下的 scripts/
 */
export function getScriptPath(scriptName: string): string {
  // 检查是否为打包环境（通过是否存在资源目录判断）
  const { app } = require('electron')
  
  // 尝试获取资源目录路径
  let scriptsDir: string
  
  try {
    // 打包后的应用
    scriptsDir = path.join(process.resourcesPath, 'scripts')
  } catch {
    // 开发环境：使用项目根目录
    scriptsDir = path.join(projectRoot, 'scripts', 'dev')
  }
  
  return path.join(scriptsDir, scriptName)
}
/**
 * @deprecated 使用 PROJECT_ROOT 替代。此导出仅为向后兼容，并非 Node.js 原生的 __dirname
 */
export const __dirname = PROJECT_ROOT
/**
 * @deprecated 使用 PROJECT_ROOT 替代。此导出仅为向后兼容，并非 Node.js 原生的 __filename
 */
export const __filename = PROJECT_ROOT
