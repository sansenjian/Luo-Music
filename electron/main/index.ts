/**
 * 主进程入口模块
 *
 * 遵循 VSCode 的 Code 模式，作为 Electron 主进程的入口点。
 * 负责组装各个子模块，协调应用启动流程。
 */

import 'dotenv/config'
import { BrowserWindow, ipcMain } from 'electron'
import { desktopLyricManager } from '../DesktopLyricManager'
import { windowManager } from '../WindowManager'
import logger, { initSentry, Sentry, writeStructuredLog } from '../logger'
import type * as SentryMain from '@sentry/electron/main'
import { serviceManager } from '../ServiceManager'
import type { LogEntry } from '../shared/log'
import type { ServiceConfig } from '../types/service'
import { RENDERER_DIST, VITE_PUBLIC } from '../utils/paths'

// 统一 IPC 服务
import {
  ipcService,
  errorMiddleware,
  loggerMiddleware,
  registerWindowHandlers,
  registerCacheHandlers,
  registerPlayerHandlers,
  registerServiceHandlers,
  registerApiHandlers,
  registerLyricHandlers
} from '../ipc/index'

import {
  requestSingleInstanceLock,
  setupDevUserData,
  setupErrorHandlers,
  registerAppLifecycle
} from './app'
import { createTray, setWindowManager as setTrayWindowManager } from './tray'
import {
  registerShortcuts,
  unregisterAllShortcuts,
  setWindowManager as setShortcutsWindowManager
} from './shortcuts'
import { DEFAULT_SHORTCUTS } from '../../src/config/shortcuts'

// 重写 console 以使用 electron-logger
console.log = logger.log.bind(logger)
console.error = logger.error.bind(logger)
console.warn = logger.warn.bind(logger)
console.info = logger.info.bind(logger)

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  services: {
    netease: {
      enabled: true,
      port: 14532
    },
    qq: {
      enabled: true,
      port: 3200
    }
  }
}

/**
 * 初始化应用
 */
async function initializeApp(): Promise<void> {
  logger.info('Starting services via ServiceManager...')

  // Initialize IPC first so renderer requests can observe service state immediately.
  initializeIpcService()

  logger.info('Launching API services through ServiceManager child processes...')
  await serviceManager.initialize(DEFAULT_SERVICE_CONFIG)
  const allStatus = serviceManager.getAllServiceStatus()
  logger.info('Service status:', JSON.stringify(allStatus, null, 2))

  windowManager.createWindow()
  windowManager.getWindow()?.webContents.once('did-finish-load', () => {
    desktopLyricManager.prewarmWindow()
  })

  // 创建托盘
  createTray()

  // 注册快捷键
  registerShortcuts(DEFAULT_SHORTCUTS)

  // 初始化缓存管理器
  // 注意：不再在启动时自动清理缓存，避免影响用户登录状态和数据
  // await cleanupSession()
}

/**
 * 初始化统一 IPC 服务
 */
function initializeIpcService(): void {
  // 配置 IPC 服务（设置超时时间为 10 秒，适用于 API 调用等耗时操作）
  ipcService.configure({ defaultTimeout: 10000 })

  // 注册中间件
  ipcService.use(errorMiddleware)
  ipcService.use(loggerMiddleware)

  // 注册所有处理器
  registerWindowHandlers(windowManager)
  registerCacheHandlers()
  registerPlayerHandlers(windowManager)
  registerServiceHandlers(serviceManager)
  registerApiHandlers(serviceManager)
  registerLyricHandlers()

  // 注册日志 IPC（保留旧的日志处理）
  registerLogIPC()

  // 注册错误报告 IPC
  ipcMain.on(
    'error-report',
    (_event, errorData: { code: string; message: string; stack?: string; data?: unknown }) => {
      const fullMessage = `[ERROR_REPORT] ${errorData.code}: ${errorData.message}`

      // 记录到本地日志
      logger.error(fullMessage, errorData.stack, errorData.data)

      // 上报到 Sentry（如果已初始化）
      if (Sentry) {
        Sentry.captureException(new Error(errorData.message), (scope: SentryMain.Scope) => {
          scope.setTag('error_code', errorData.code)
          scope.setContext('error_data', {
            code: errorData.code,
            message: errorData.message,
            stack: errorData.stack,
            data: errorData.data
          })
          return scope
        })
      }
    }
  )

  // 初始化 IPC 服务
  ipcService.initialize()

  logger.info('[IPC] Unified IPC service initialized')
}

/**
 * 注册日志 IPC 通道
 */
function registerLogIPC(): void {
  ipcMain.on('log-message', (_event, entry: LogEntry) => {
    writeStructuredLog(entry)
  })
}

/**
 * 主函数
 */
function main(): void {
  // 请求单实例锁
  requestSingleInstanceLock()

  // 设置开发环境用户数据目录
  setupDevUserData()

  // 设置错误处理
  setupErrorHandlers()

  // Sentry
  void initSentry()

  // 设置环境变量
  process.env.DIST = RENDERER_DIST
  process.env.VITE_PUBLIC = VITE_PUBLIC

  // 设置窗口管理器引用
  setTrayWindowManager(windowManager)
  setShortcutsWindowManager(windowManager)

  // 注册应用生命周期
  registerAppLifecycle({
    onReady: initializeApp,

    onWindowAllClosed: async () => {
      unregisterAllShortcuts()
      if (process.platform !== 'darwin') {
        const { app } = require('electron')
        app.quit()
      }
    },

    onWillQuit: async () => {
      unregisterAllShortcuts()
      await serviceManager.stopAllServices()
    },

    onActivate: () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createWindow()
      }
    },

    onSecondInstance: () => {
      windowManager.restore()
    }
  })
}

// 启动应用
main()
