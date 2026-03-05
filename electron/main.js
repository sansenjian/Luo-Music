// @ts-nocheck
import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import { windowManager } from './WindowManager'
import logger from './logger'
import { initPlayerIPC } from './ipc'

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

function logError(type, error) {
  logger.error(`[${type}]`, error);
}

ipcMain.on('error-report', (_, errorData) => {
  logger.error(`[ERROR_REPORT] ${errorData.code}: ${errorData.message}`, errorData.stack, errorData.data);
})

if (!app.isPackaged) {
  const userDataPath = path.join(__dirname, '../.userData')
  app.setPath('userData', userDataPath)
}

const MAIN_DIST = __dirname
const RENDERER_DIST = path.join(__dirname, '../dist')

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = app.isPackaged ? RENDERER_DIST : path.join(__dirname, '../public')

let tray = null

const NETEASE_PORT = 14532
const QQ_MUSIC_PORT = 3200

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function checkPort(port) {
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
    path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
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
  
  tray.setToolTip('LUO Music')
  tray.setContextMenu(contextMenu)
  
  tray.on('double-click', () => {
    windowManager.show()
  })
  
  windowManager.setTray(tray, contextMenu)
  return tray
}

import { DEFAULT_SHORTCUTS } from '../src/config/shortcuts.js'

function registerShortcuts() {
  // 动作映射
  const actions = {
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
      } catch (e) {
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
  } catch (err) {
    logger.error('❌ 网易云音乐 API 启动失败:', err.message)
    logError('neteaseApi', err)
  }
}

// 启动 QQ 音乐 API（直接在主进程中加载）
async function startQQMusicApi() {
  try {
    logger.info('=== Starting QQ Music API (main process) ===')
    
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
    
    // 注意：我们不切回 originalCwd，因为 API 可能会在运行时继续读写文件
    // 主进程的其他部分应该使用绝对路径，所以改变 CWD 影响不大
  } catch (err) {
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
  } catch (error) {
    logger.error('⚠️ 网易云 API 启动失败，但继续运行:', error.message)
  }
  
  try {
    await startQQMusicApi()
    logger.info('✅ QQ 音乐 API 已启动')
  } catch (error) {
    logger.error('⚠️ QQ 音乐 API 启动失败，但继续运行:', error.message)
  }

  ipcMain.on('log-message', (event, { level, module, message, data }) => {
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

  ipcMain.handle('cache:get-size', async () => {
    const ses = session.defaultSession
    const size = await ses.getCacheSize()
    return {
      httpCache: size,
      httpCacheFormatted: formatBytes(size)
    }
  })

  ipcMain.handle('cache:clear', async (event, options = {}) => {
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
      indexDB = false,
      webSQL = false,
      cache = false,
      serviceWorkers = false,
      shaderCache = false,
      all = false
    } = options

    const ses = session.defaultSession
    const results = { success: [], failed: [] }

    const storages = []
    if (cookies || all) storages.push('cookies')
    if (localStorage || all) storages.push('localstorage')
    if (sessionStorage || all) storages.push('sessionstorage')
    if (indexDB || all) storages.push('indexdb')
    if (webSQL || all) storages.push('websql')
    if (serviceWorkers || all) storages.push('serviceworkers')
    if (shaderCache || all) storages.push('shadercache')

    if (storages.length > 0) {
      try {
        await ses.clearStorageData({ storages })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: error.message })
      }
    }

    if (cache || all) {
      try {
        await ses.clearCache()
        results.success.push('http-cache')
      } catch (error) {
        results.failed.push({ type: 'http-cache', error: error.message })
      }
    }

    return results
  })

  ipcMain.handle('cache:clear-all', async (event, keepUserData = false) => {
    const ses = session.defaultSession
    const results = { success: [], failed: [] }

    const storages = []
    if (keepUserData) {
      storages.push('cookies', 'sessionstorage', 'serviceworkers', 'shadercache')
    } else {
      storages.push('cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'serviceworkers', 'shadercache')
    }

    if (storages.length > 0) {
      try {
        await ses.clearStorageData({ storages })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: error.message })
      }
    }

    try {
      await ses.clearCache()
      results.success.push('http-cache')
    } catch (error) {
      results.failed.push({ type: 'http-cache', error: error.message })
    }

    return results
  })

  ipcMain.handle('cache:get-paths', () => {
    return {
      userData: app.getPath('userData'),
      cache: app.getPath('cache'),
      temp: app.getPath('temp'),
      logs: app.getPath('logs')
    }
  })

  // Window control IPC handlers are now in WindowManager

  windowManager.createWindow()
  createTray()
  registerShortcuts()
  initPlayerIPC()
  
  const ses = session.defaultSession
  try {
    await ses.clearCache()
    logger.info('Startup: HTTP cache cleared')
  } catch (e) {
    logger.error('Startup: Failed to clear cache', e)
  }
  
  try {
    await ses.clearStorageData({
      storages: ['sessionstorage', 'serviceworkers', 'shadercache', 'websql', 'indexeddb']
    })
    logger.info('Startup: Temporary storage cleared (preserved localStorage and cookies)')
  } catch (error) {
    logger.error('Startup: Failed to clear storage data:', error)
  }
})
