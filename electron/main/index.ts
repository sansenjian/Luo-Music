/**
 * 主进程入口模块
 * 
 * 遵循 VSCode 的 Code 模式，作为 Electron 主进程的入口点。
 * 负责组装各个子模块，协调应用启动流程。
 */

import { BrowserWindow, ipcMain, session } from 'electron'
import { windowManager } from '../WindowManager'
import logger from '../logger'
import { initPlayerIPC } from '../ipc'
import { cacheManager } from '../cacheManager'
import { serverManager } from '../ServerManager'
import { RENDERER_DIST, VITE_PUBLIC } from '../utils/paths'
import {
  requestSingleInstanceLock,
  setupDevUserData,
  setupErrorHandlers,
  registerAppLifecycle
} from './app'
import { createTray, setWindowManager as setTrayWindowManager } from './tray'
import { registerShortcuts, unregisterAllShortcuts, setWindowManager as setShortcutsWindowManager } from './shortcuts'
import { DEFAULT_SHORTCUTS } from '../../src/config/shortcuts'

// 重写 console 以使用 electron-logger
console.log = logger.log.bind(logger)
console.error = logger.error.bind(logger)
console.warn = logger.warn.bind(logger)
console.info = logger.info.bind(logger)

/**
 * 初始化应用
 */
async function initializeApp(): Promise<void> {
  logger.info('Starting services via ServerManager...')

  // 检查是否由 launcher 启动了 API 服务（开发模式）
  const neteaseStartedByLauncher = process.env.NETEASE_API_STARTED_BY_LAUNCHER === 'true'
  const qqMusicStartedByLauncher = process.env.QQ_MUSIC_API_STARTED_BY_LAUNCHER === 'true'

  if (neteaseStartedByLauncher) {
    logger.info('ℹ️ 检测到网易云 API 已由 launcher 启动')
    serverManager.markServiceAsRunning('netease', 14532)
  }
  if (qqMusicStartedByLauncher) {
    logger.info('ℹ️ 检测到 QQ 音乐 API 已由 launcher 启动')
    serverManager.markServiceAsRunning('qq', 3200)
  }

  // 注册服务状态 IPC 通道
  registerServiceIPC()

  // 只有在 launcher 未启动任何服务时才启动
  if (!neteaseStartedByLauncher && !qqMusicStartedByLauncher) {
    logger.info('🚀 后台启动服务中...')
    serverManager.startAllServices().then(() => {
      logger.info('✅ 所有服务启动完成')
      const allStatus = serverManager.getAllServiceStatus()
      logger.info('服务状态:', JSON.stringify(allStatus, null, 2))
    }).catch((error: Error) => {
      logger.error('⚠️ 服务启动过程中出现错误:', error.message)
    })
  }

  // 注册日志 IPC
  registerLogIPC()

  // 创建窗口
  windowManager.createWindow()

  // 创建托盘
  createTray()

  // 注册快捷键
  registerShortcuts(DEFAULT_SHORTCUTS)

  // 初始化播放器 IPC
  initPlayerIPC()

  // 初始化缓存管理器
  cacheManager.init()

  // 清理会话缓存
  await cleanupSession()
}

/**
 * 注册服务状态 IPC 通道
 */
function registerServiceIPC(): void {
  // 获取所有服务状态
  ipcMain.handle('service:status:all', async () => {
    return serverManager.getAllServiceStatus()
  })

  // 重启服务
  ipcMain.handle('service:restart', async (_event, serviceName: string) => {
    return serverManager.restartService(serviceName)
  })

  // 健康检查
  ipcMain.handle('service:health', async (_event, serviceName: string) => {
    return serverManager.checkServiceHealth(serviceName)
  })

  // 更新服务配置
  ipcMain.handle('service:update-config', async (_event, serviceName: string, config: unknown) => {
    return serverManager.updateServiceConfig(serviceName, config)
  })

  logger.info('[IPC] Service IPC handlers registered')
}

/**
 * 注册日志 IPC 通道
 */
function registerLogIPC(): void {
  ipcMain.on('log-message', (_event, { level, module, message, data }: {
    level: string
    module: string
    message: string
    data?: unknown
  }) => {
    const text = `[${module}] ${message}`
    switch (level) {
      case 'error':
        logger.error(text, data || '')
        break
      case 'warn':
        logger.warn(text, data || '')
        break
      case 'info':
        logger.info(text, data || '')
        break
      default:
        logger.verbose(text, data || '')
    }
  })
}

/**
 * 清理会话缓存
 */
async function cleanupSession(): Promise<void> {
  const ses = session.defaultSession
  
  try {
    await ses.clearCache()
    logger.info('Startup: HTTP cache cleared')
  } catch (e) {
    logger.error('Startup: Failed to clear cache', e)
  }

  try {
    await ses.clearStorageData({
      storages: ['serviceworkers', 'shadercache', 'websql']
    })
    logger.info('Startup: Temporary storage cleared (preserved localStorage and cookies)')
  } catch (error) {
    logger.error('Startup: Failed to clear storage data:', error)
  }
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

  // 设置环境变量
  process.env.DIST = RENDERER_DIST
  process.env.VITE_PUBLIC = VITE_PUBLIC

  // 设置窗口管理器引用
  setTrayWindowManager(windowManager)
  setShortcutsWindowManager(windowManager)

  // 注册错误报告 IPC
  ipcMain.on('error-report', (_event, errorData: { code: string; message: string; stack?: string; data?: unknown }) => {
    logger.error(`[ERROR_REPORT] ${errorData.code}: ${errorData.message}`, errorData.stack, errorData.data)
  })

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
      await serverManager.stopAllServices()
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