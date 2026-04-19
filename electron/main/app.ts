/**
 * 应用生命周期管理
 *
 * 负责 Electron 应用的启动、退出、单实例锁定等核心生命周期事件。
 * 遵循 VSCode 的 App 模式，将生命周期管理与业务逻辑分离。
 */

import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import logger from '../logger'
import { PROJECT_ROOT } from '../utils/paths'

const WINDOWS_APP_USER_MODEL_ID = 'com.sansenjian.luo-music'
const WINDOWS_SQUIRREL_PACKAGE_ID = 'LUO_Music'
const APP_DISPLAY_NAME = 'LUO Music'

/**
 * 单实例锁状态
 */
let hasLock = false

/**
 * 请求单实例锁
 * 如果已有实例运行，则退出当前实例
 */
export function requestSingleInstanceLock(): boolean {
  hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    logger.warn('Instance already running, quitting...')
    app.quit()
    process.exit(0)
  }

  return hasLock
}

/**
 * 检查是否持有单实例锁
 */
export function hasSingleInstanceLock(): boolean {
  return hasLock
}

/**
 * 设置开发环境用户数据目录
 * 开发模式下使用项目内的 .userData 目录
 */
export function setupDevUserData(): void {
  if (!app.isPackaged) {
    const path = require('node:path')
    const userDataPath = path.join(PROJECT_ROOT, '.userData')
    app.setPath('userData', userDataPath)
    logger.info(`[App] Dev userData path: ${userDataPath}`)
  }
}

/**
 * 设置 Windows Shell 集成所需的 AppUserModelId 和显示名称。
 *
 * Windows SMTC、任务栏缩略图和通知中心使用 AppUserModelId 来标识应用，
 * 并通过注册表中的 DisplayName 条目来解析显示名称。如果该 ID 没有注册表
 * 条目，Windows 会显示"未知应用"。
 *
 * 这里始终使用固定的 AppUserModelId（不区分开发/生产），并在启动时
 * 向 HKCU 注册表写入 DisplayName，确保 SMTC 正确显示 "LUO Music"。
 */
export function setupWindowsShellIntegration(): void {
  if (process.platform !== 'win32') {
    return
  }

  app.setName(APP_DISPLAY_NAME)

  const appUserModelId = resolveWindowsAppUserModelId()
  app.setAppUserModelId(appUserModelId)
  logger.info(`[App] Windows AppUserModelId: ${appUserModelId}`)

  registerAppUserModelIdDisplayName(appUserModelId)
}

function resolveWindowsAppUserModelId(): string {
  if (!app.isPackaged) {
    return WINDOWS_APP_USER_MODEL_ID
  }

  const executableName = path.basename(process.execPath, path.extname(process.execPath))
  const squirrelUpdateExePath = path.resolve(path.dirname(process.execPath), '..', 'Update.exe')

  if (existsSync(squirrelUpdateExePath)) {
    return `com.squirrel.${WINDOWS_SQUIRREL_PACKAGE_ID}.${executableName}`
  }

  return WINDOWS_APP_USER_MODEL_ID
}

/**
 * Write the display name for the given AppUserModelId into the per-user
 * registry so that Windows SMTC and the taskbar can resolve a human-readable
 * name instead of showing "Unknown application".
 */
function registerAppUserModelIdDisplayName(appUserModelId: string): void {
  const escapedId = appUserModelId.replace(/"/g, '\\"')
  const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${escapedId}`

  execFile(
    'reg',
    ['add', regKey, '/v', 'DisplayName', '/t', 'REG_EXPAND_SZ', '/d', APP_DISPLAY_NAME, '/f'],
    error => {
      if (error) {
        logger.warn(`[App] Failed to register DisplayName for AppUserModelId: ${error.message}`)
      } else {
        logger.info(`[App] Registered DisplayName "${APP_DISPLAY_NAME}" for ${appUserModelId}`)
      }
    }
  )
}

/**
 * 注册全局异常处理
 */
export function setupErrorHandlers(): void {
  process.on('uncaughtException', error => {
    logger.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  })
}

/**
 * 应用生命周期回调类型
 */
export interface AppLifecycleCallbacks {
  onReady: () => Promise<void> | void
  onWindowAllClosed: () => Promise<void> | void
  onWillQuit: (event: Electron.Event) => Promise<void> | void
  onActivate: () => void
  onSecondInstance: () => void
}

/**
 * 注册应用生命周期事件
 */
export function registerAppLifecycle(callbacks: AppLifecycleCallbacks): void {
  app.on('window-all-closed', async () => {
    await callbacks.onWindowAllClosed()
  })

  app.on('will-quit', (event: Electron.Event) => {
    event.preventDefault()
    Promise.resolve()
      .then(() => callbacks.onWillQuit(event))
      .catch((error: unknown) => {
        logger.error('[App] Cleanup error during quit:', error)
      })
      .finally(() => {
        app.exit(0)
      })
  })

  app.on('activate', () => {
    callbacks.onActivate()
  })

  app.on('second-instance', () => {
    callbacks.onSecondInstance()
  })

  // 使用 void 操作符显式标记未处理的 Promise
  void app.whenReady().then(async () => {
    logger.info('=== App Ready ===')
    await callbacks.onReady()
  })
}

/**
 * 退出应用
 */
export function quitApp(exitCode = 0): void {
  app.exit(exitCode)
}

/**
 * 获取应用版本
 */
export function getAppVersion(): string {
  return app.getVersion()
}

/**
 * 检查是否为打包后的应用
 */
export function isPackaged(): boolean {
  return app.isPackaged
}
