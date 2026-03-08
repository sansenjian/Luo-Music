import path from 'node:path'

// 使用 process.cwd() 获取项目根目录
// 这在开发环境和打包后都能正确工作
const projectRoot = process.cwd()

// 导出常用路径（均为项目根目录下的绝对路径）
export const MAIN_DIST = path.join(projectRoot, 'dist-electron')
export const RENDERER_DIST = path.join(projectRoot, 'dist')
export const VITE_PUBLIC = process.env.VITE_PUBLIC || path.join(projectRoot, 'public')
export const __dirname = projectRoot
export const __filename = projectRoot
