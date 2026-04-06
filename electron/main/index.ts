/**
 * 主进程入口模块
 *
 * 遵循 VSCode 的 Code 模式，作为 Electron 主进程的入口点。
 * 负责组装各个子模块，协调应用启动流程。
 */

import 'dotenv/config'
import { BrowserWindow } from 'electron'
import { desktopLyricManager } from '../DesktopLyricManager'
import { downloadManager } from '../DownloadManager'
import { windowManager } from '../WindowManager'
import logger, { initSentry } from '../logger'
import { serviceManager } from '../ServiceManager'
import type { ServiceConfig } from '../types/service'
import { RENDERER_DIST, VITE_PUBLIC } from '../utils/paths'

import {
  ipcService,
  errorMiddleware,
  loggerMiddleware,
  performanceMiddleware,
  disposePerformanceMonitor,
  registerWindowHandlers,
  registerCacheHandlers,
  registerConfigHandlers,
  registerPlayerHandlers,
  registerServiceHandlers,
  registerApiHandlers,
  registerLyricHandlers,
  registerLogHandlers
} from '../ipc/index'

import {
  requestSingleInstanceLock,
  setupDevUserData,
  setupErrorHandlers,
  registerAppLifecycle
} from './app'
import { createTray, destroyTray, setWindowManager as setTrayWindowManager } from './tray'
import {
  registerShortcuts,
  unregisterAllShortcuts,
  setWindowManager as setShortcutsWindowManager
} from './shortcuts'
import { DEFAULT_SHORTCUTS } from '../../src/config/shortcuts'
import { NETEASE_API_PORT, QQ_API_PORT } from '../shared/protocol/cache'

console.log = logger.log.bind(logger)
console.error = logger.error.bind(logger)
console.warn = logger.warn.bind(logger)
console.info = logger.info.bind(logger)

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  services: {
    netease: {
      enabled: true,
      port: NETEASE_API_PORT
    },
    qq: {
      enabled: true,
      port: QQ_API_PORT
    }
  }
}

async function initializeApp(): Promise<void> {
  initializeIpcService()

  logger.info('Initializing services via ServiceManager...')
  await serviceManager.initialize(DEFAULT_SERVICE_CONFIG)
  const allStatus = serviceManager.getAllServiceStatus()
  logger.info('Service status:', JSON.stringify(allStatus, null, 2))

  windowManager.createWindow()
  windowManager.getWindow()?.webContents.once('did-finish-load', () => {
    desktopLyricManager.prewarmWindow()
  })

  createTray()
  registerShortcuts(DEFAULT_SHORTCUTS)
}

function initializeIpcService(): void {
  ipcService.configure({
    defaultTimeout: 15000,
    slowRequestThreshold: 1000,
    enablePerformanceMonitoring: true
  })

  ipcService.use(errorMiddleware)
  ipcService.use(loggerMiddleware)
  ipcService.use(performanceMiddleware)

  registerWindowHandlers(windowManager)
  registerCacheHandlers()
  registerConfigHandlers()
  registerPlayerHandlers(windowManager, serviceManager)
  registerServiceHandlers(serviceManager)
  registerApiHandlers(serviceManager)
  registerLyricHandlers()
  registerLogHandlers()

  ipcService.initialize()

  logger.info('[IPC] Unified IPC service initialized')
}

function main(): void {
  requestSingleInstanceLock()
  setupDevUserData()
  setupErrorHandlers()

  void initSentry()

  process.env.DIST = RENDERER_DIST
  process.env.VITE_PUBLIC = VITE_PUBLIC

  setTrayWindowManager(windowManager)
  setShortcutsWindowManager(windowManager)

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
      desktopLyricManager.closeWindow()
      destroyTray()
      downloadManager.dispose()
      disposePerformanceMonitor()
      ipcService.dispose()
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

main()
