import { createRequire } from 'node:module'
import electron, { type Tray as TrayType } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import { windowManager } from './WindowManager'
import logger from './logger'
import { initPlayerIPC } from './ipc'
import { cacheManager } from './cacheManager'
import { __dirname, MAIN_DIST, RENDERER_DIST, VITE_PUBLIC } from './utils/paths'

const require = createRequire(__filename)
const { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, globalShortcut } = electron

// 引入网易云 API（借鉴 mrfz 方式：主进程直接加载）
const { serveNcmApi } = require('@neteasecloudmusicapienhanced/api')

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

const NETEASE_PORT = 14532
const QQ_MUSIC_PORT = 3200

function checkPort(port: number) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

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

app.on('window-all-closed', async () => {
  globalShortcut.unregisterAll()
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createWindow()
  }
})

app.on('second-instance', () => {
  windowManager.restore()
})

// 启动网易云 API（借鉴 mrfz 方式：主进程直接加载）
async function startNeteaseApi() {
  try {
    console.log('=== Starting Netease API (main process) ===')
    await serveNcmApi({
      port: 14532,
      host: 'localhost',
    })
    logger.info('✅ 网易云音乐 API 服务已启动在 http://localhost:14532')
  } catch (err: any) {
    logger.error('❌ 网易云音乐 API 启动失败:', err.message)
    logError('neteaseApi', err)
  }
}

// 启动 QQ 音乐 API（直接在主进程中加载）
async function startQQMusicApi() {
  try {
    logger.info('=== Starting QQ Music API (main process) ===')
    
    // 检查端口是否被占用
    const qqPortAvailable = await checkPort(QQ_MUSIC_PORT)
    if (!qqPortAvailable) {
      logger.warn(`⚠️ 端口 ${QQ_MUSIC_PORT} 已被占用，尝试停止占用进程...`)
      
      // 尝试找到并终止占用端口的进程
      try {
        const { execSync } = require('child_process')
        const output = execSync(`netstat -ano | findstr :${QQ_MUSIC_PORT}`).toString()
        const lines = output.split('\n').filter((line: string) => line.includes('LISTENING'))
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== process.pid.toString()) {
            logger.info(`终止占用端口的进程 PID: ${pid}`)
            execSync(`taskkill /F /PID ${pid}`)
            logger.info(`已终止进程 ${pid}`)
          }
        }
        
        // 等待端口释放
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (killError: any) {
        logger.error('无法终止占用端口的进程:', killError.message)
        throw new Error(`端口 ${QQ_MUSIC_PORT} 被占用，无法启动 QQ 音乐 API`)
      }
    }
    
    // 切换工作目录到 userData，防止 API 写入只读目录报错
    // QQ 音乐 API 可能会尝试写入 cookie 等文件
    const userDataPath = app.getPath('userData')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    
    const originalCwd = process.cwd()
    try {
      process.chdir(userDataPath)
      logger.info(`Changed CWD to ${userDataPath} for API startup`)
    } catch (err) {
      logger.error('Failed to change CWD:', err)
    }

    // 设置环境变量
    process.env.PORT = '3200'
    process.env.HOST = 'localhost'
    
    // 直接 require 模块
    // 注意：@sansenjian/qq-music-api 的入口是 index.js，它 require 了 app.js
    // app.js 会自动执行 app.listen
    const qqMusicApi = require('@sansenjian/qq-music-api')
    
    logger.info('✅ QQ 音乐 API 服务已启动在 http://localhost:3200')
    
    // 恢复原始工作目录，避免影响 Electron preload 脚本加载
    try {
      process.chdir(originalCwd)
      logger.info(`Restored CWD to ${originalCwd}`)
    } catch (err) {
      logger.error('Failed to restore CWD:', err)
    }
  } catch (err: any) {
    logger.error('❌ QQ 音乐 API 启动失败:', err.message)
    logError('qqMusicApi', err)
  }
}

app.whenReady().then(async () => {
  logger.info('=== App Ready ===')
  logger.info('Checking ports...')
  
  const neteaseAvailable = await checkPort(NETEASE_PORT)
  const qqAvailable = await checkPort(QQ_MUSIC_PORT)
  logger.info(`Port ${NETEASE_PORT} available:`, neteaseAvailable)
  logger.info(`Port ${QQ_MUSIC_PORT} available:`, qqAvailable)
  
  // 启动 API 服务
  try {
    await startNeteaseApi()
    logger.info('✅ 网易云 API 已启动')
  } catch (error: any) {
    logger.error('⚠️ 网易云 API 启动失败，但继续运行:', error.message)
  }
  
  try {
    await startQQMusicApi()
    logger.info('✅ QQ 音乐 API 已启动')
  } catch (error: any) {
    logger.error('⚠️ QQ 音乐 API 启动失败，但继续运行:', error.message)
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
