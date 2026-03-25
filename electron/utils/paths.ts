import path from 'node:path'

type ElectronAppLike = {
  isPackaged?: boolean
}

function getElectronApp(): ElectronAppLike | null {
  try {
    const { app } = require('electron') as { app?: ElectronAppLike }
    return app ?? null
  } catch {
    return null
  }
}

const electronApp = getElectronApp()
const hasResourcesPath =
  typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
const isPackaged = electronApp?.isPackaged ?? (!process.env.VITE_DEV_SERVER_URL && hasResourcesPath)
const appRoot =
  process.env.APP_ROOT ||
  (isPackaged ? path.join(process.resourcesPath, 'app.asar') : process.cwd())

export const PROJECT_ROOT = appRoot
export const BUILD_DIR = path.join(PROJECT_ROOT, 'build')
export const MAIN_DIST = path.join(BUILD_DIR, 'electron')
export const RENDERER_DIST = BUILD_DIR
export const VITE_PUBLIC = process.env.VITE_PUBLIC || path.join(PROJECT_ROOT, 'public')

export function getScriptPath(scriptName: string): string {
  // 打包后脚本位于 resources/ 根目录（extraResource 直接复制文件名）
  // 开发模式位于 scripts/dev/
  const scriptPath = isPackaged
    ? path.join(process.resourcesPath, scriptName)
    : path.join(PROJECT_ROOT, 'scripts', 'dev', scriptName)

  return scriptPath
}

/**
 * @deprecated Use PROJECT_ROOT instead. This export exists only for compatibility.
 */
export const __dirname = PROJECT_ROOT

/**
 * @deprecated Use PROJECT_ROOT instead. This export exists only for compatibility.
 */
export const __filename = PROJECT_ROOT
