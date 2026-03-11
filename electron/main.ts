import { createRequire } from 'node:module'
import type { Tray as TrayType } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { windowManager } from './WindowManager'
import logger from './logger'
import { initPlayerIPC } from './ipc'
import { cacheManager } from './cacheManager'
import { __dirname, RENDERER_DIST, VITE_PUBLIC } from './utils/paths'
import { serverManager } from './ServerManager'

const require = createRequire(__filename)
// 使用 require 导入 electron，避免 ESM 打包后命名导出问题
const { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, globalShortcut } = require('electron')

// 重写 console.log 以使用 electron-logger
console.log = logger.log.bind(logger);
console.error = logger.error.bind(logger);
console.warn = logger.warn.bind(logger);
console.info = logger.info.bind(logger);

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  logger.warn('Instance already running, quitting...');
  app.quit()
  process.exit(0)
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

function logError(type: string, error: any) {
  logger.error(`[${type}]`, error);
}

ipcMain.on('error-report', (_event: Electron.IpcMainEvent, errorData: { code: string; message: string; stack?: string; data?: unknown }) => {
  logger.error(`[ERROR_REPORT] ${errorData.code}: ${errorData.message}`, errorData.stack, errorData.data);
})

if (!app.isPackaged) {
  const userDataPath = path.join(__dirname, '../.userData')
  app.setPath('userData', userDataPath)
}

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

let tray: TrayType | null = null

function getIconPath() {
  const possiblePaths = [
    path.join(VITE_PUBLIC as string, 'electron-vite.svg'),
    path.join(__dirname, '../public/electron-vite.svg'),
    path.join(process.resourcesPath, 'app.asar', 'public', 'electron-vite.svg')
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function createTray() {
  const iconPath = getIconPath()
  if (!iconPath) {
    logger.warn('Tray icon not found, skipping tray creation')
    return null
  }
  
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '播放/暂停',
      click: () => {
        windowManager.send('music-playing-control')
      }
    },
    {
      label: '上一首',
      click: () => {
        windowManager.send('music-song-control', 'prev')
      }
    },
    {
      label: '下一首',
      click: () => {
        windowManager.send('music-song-control', 'next')
      }
    },
    { type: 'separator' },
    {
      label: '播放模式',
      submenu: [
        {
          label: '顺序播放',
          type: 'radio',
          click: () => windowManager.send('music-playmode-control', 0)
        },
        {
          label: '列表循环',
          type: 'radio',
          click: () => windowManager.send('music-playmode-control', 1)
        },
        {
          label: '单曲循环',
          type: 'radio',
          click: () => windowManager.send('music-playmode-control', 2)
        },
        {
          label: '随机播放',
          type: 'radio',
          click: () => windowManager.send('music-playmode-control', 3)
        }
      ]
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        windowManager.show()
      }
    },
    {
      label: '退出',
      click: () => {
        app.exit(0)
      }
    }
  ])
  
  // TypeScript 空值检查：tray 在第 92 行赋值，但需要确保非空
  if (!tray) {
    logger.warn('Failed to create tray instance')
    return null
  }
  
  tray.setToolTip('LUO Music')
  tray.setContextMenu(contextMenu)
  
  tray.on('double-click', () => {
    windowManager.show()
  })
  
  windowManager.setTray(tray, contextMenu)
  return tray
}

import { DEFAULT_SHORTCUTS } from '../src/config/shortcuts'

function registerShortcuts() {
  // 动作映射
  const actions: Record<string, () => void> = {
    togglePlay: () => windowManager.send('music-playing-control'),
    playPrev: () => windowManager.send('music-song-control', 'prev'),
    playNext: () => windowManager.send('music-song-control', 'next'),
    volumeUp: () => windowManager.send('music-volume-up'),
    volumeDown: () => windowManager.send('music-volume-down'),
    seekBack: () => windowManager.send('music-process-control', 'back'),
    seekForward: () => windowManager.send('music-process-control', 'forward'),
    toggleCompact: () => windowManager.send('hide-player')
  }

  for (const shortcut of DEFAULT_SHORTCUTS) {
    if (!shortcut.globalKeys || shortcut.globalKeys.length === 0) continue
    
    const action = actions[shortcut.action]
    if (!action) continue

    for (const key of shortcut.globalKeys) {
      try {
        globalShortcut.register(key, action)
      } catch (e: any) {
        console.log(`Failed to register shortcut ${key}:`, e.message)
      }
    }
  }
}

// 注册服务状态相关的 IPC 通道
// 注意：service:status, service:start, service:stop 已在 ipc.ts 的 initAPIGateway() 中注册
// 这里只注册 ipc.ts 中未包含的额外服务管理功能
function registerServiceIPC() {
  // 获取所有服务状态（ipc.ts 中未包含）
  ipcMain.handle('service:status:all', async () => {
    return serverManager.getAllServiceStatus()
  })

  // 重启服务（ipc.ts 中未包含）
  ipcMain.handle('service:restart', async (_event, serviceName: string) => {
    return serverManager.restartService(serviceName)
  })

  // 健康检查（ipc.ts 中未包含）
  ipcMain.handle('service:health', async (_event, serviceName: string) => {
    return serverManager.checkServiceHealth(serviceName)
  })

  // 更新服务配置（ipc.ts 中未包含）
  ipcMain.handle('service:update-config', async (_event, serviceName: string, config: any) => {
    return serverManager.updateServiceConfig(serviceName, config)
  })

  logger.info('[IPC] Service IPC handlers registered')
}

app.on('window-all-closed', async () => {
  globalShortcut.unregisterAll()
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  
  // 停止所有服务
  await serverManager.stopAllServices()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createWindow()
  }
})

app.on('second-instance', () => {
  windowManager.restore()
})

app.whenReady().then(async () => {
  logger.info('=== App Ready ===')
  logger.info('Starting services via ServerManager...')

  // 检查是否由 launcher 启动了 API 服务（开发模式）
  const neteaseStartedByLauncher = process.env.NETEASE_API_STARTED_BY_LAUNCHER === 'true'
  const qqMusicStartedByLauncher = process.env.QQ_MUSIC_API_STARTED_BY_LAUNCHER === 'true'
  
  if (neteaseStartedByLauncher) {
    logger.info('ℹ️ 检测到网易云 API 已由 launcher 启动')
    // 更新服务状态为已运行
    serverManager.markServiceAsRunning('netease', 14532)
  }
  if (qqMusicStartedByLauncher) {
    logger.info('ℹ️ 检测到 QQ 音乐 API 已由 launcher 启动')
    // 更新服务状态为已运行
    serverManager.markServiceAsRunning('qq', 3200)
  }

  // 注册服务状态 IPC 通道
  registerServiceIPC()

  // 只有在 launcher 未启动任何服务时才启动
  if (!neteaseStartedByLauncher && !qqMusicStartedByLauncher) {
    // 后台异步启动服务，不阻塞窗口创建
    logger.info('🚀 后台启动服务中...')
    serverManager.startAllServices().then(() => {
      logger.info('✅ 所有服务启动完成')
      const allStatus = serverManager.getAllServiceStatus()
      logger.info('服务状态:', JSON.stringify(allStatus, null, 2))
    }).catch((error: any) => {
      logger.error('⚠️ 服务启动过程中出现错误:', error.message)
    })
  }

  ipcMain.on('log-message', (_event: Electron.IpcMainEvent, { level, module, message, data }: { level: string; module: string; message: string; data?: unknown }) => {
    const text = `[${module}] ${message}`;
    if (level === 'error') {
      logger.error(text, data || '');
    } else if (level === 'warn') {
      logger.warn(text, data || '');
    } else if (level === 'info') {
      logger.info(text, data || '');
    } else {
      logger.verbose(text, data || '');
    }
  });

  // Window control IPC handlers are now in WindowManager

  windowManager.createWindow()
  createTray()
  registerShortcuts()
  initPlayerIPC()
  cacheManager.init()
  
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
})