/**
 * 应用生命周期管理
 *
 * 负责 Electron 应用的启动、退出、单实例锁定等核心生命周期事件。
 * 遵循 VSCode 的 App 模式，将生命周期管理与业务逻辑分离。
 */

import { app } from 'electron'
import logger from '../logger'
import { PROJECT_ROOT } from '../utils/paths'

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
