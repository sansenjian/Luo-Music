import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'

// 引入网易云 API（借鉴 mrfz 方式：主进程直接加载）
const { serveNcmApi } = require('@neteasecloudmusicapienhanced/api')

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  logError('uncaughtException', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  logError('unhandledRejection', reason)
})

function logError(type, error) {
  try {
    const logsDir = app.getPath('logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    const logPath = path.join(logsDir, 'error.log')
    const timestamp = new Date().toISOString()
    const message = `[${timestamp}] [${type}] ${error?.message || error}\n${error?.stack || ''}\n\n`
    fs.appendFileSync(logPath, message)
  } catch (e) {
    console.error('Failed to write error log:', e)
  }
}

if (!app.isPackaged) {
  const userDataPath = path.join(__dirname, '../.userData')
  app.setPath('userData', userDataPath)
}

const MAIN_DIST = __dirname
const RENDERER_DIST = path.join(__dirname, '../dist')

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = app.isPackaged ? RENDERER_DIST : path.join(__dirname, '../public')

let win
let tray = null

const MIN_WIDTH = 400
const MIN_HEIGHT = 80
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160

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
    console.log('Tray icon not found, skipping tray creation')
    return null
  }
  
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '播放/暂停',
      click: () => {
        win?.webContents.send('music-playing-control')
      }
    },
    {
      label: '上一首',
      click: () => {
        win?.webContents.send('music-song-control', 'prev')
      }
    },
    {
      label: '下一首',
      click: () => {
        win?.webContents.send('music-song-control', 'next')
      }
    },
    { type: 'separator' },
    {
      label: '播放模式',
      submenu: [
        {
          label: '顺序播放',
          type: 'radio',
          click: () => win?.webContents.send('music-playmode-control', 0)
        },
        {
          label: '列表循环',
          type: 'radio',
          click: () => win?.webContents.send('music-playmode-control', 1)
        },
        {
          label: '单曲循环',
          type: 'radio',
          click: () => win?.webContents.send('music-playmode-control', 2)
        },
        {
          label: '随机播放',
          type: 'radio',
          click: () => win?.webContents.send('music-playmode-control', 3)
        }
      ]
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        if (win) {
          win.show()
          win.focus()
        }
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
    if (win) {
      win.show()
      win.focus()
    }
  })
  
  return tray
}

function registerShortcuts() {
  const shortcuts = [
    { key: 'Space', action: () => win?.webContents.send('music-playing-control') },
    { key: 'MediaPlayPause', action: () => win?.webContents.send('music-playing-control') },
    { key: 'MediaPreviousTrack', action: () => win?.webContents.send('music-song-control', 'prev') },
    { key: 'MediaNextTrack', action: () => win?.webContents.send('music-song-control', 'next') },
    { key: 'MediaStop', action: () => win?.webContents.send('music-playing-control', 'stop') },
    { key: 'CommandOrControl+Up', action: () => win?.webContents.send('music-volume-up') },
    { key: 'CommandOrControl+Down', action: () => win?.webContents.send('music-volume-down') },
    { key: 'CommandOrControl+Left', action: () => win?.webContents.send('music-process-control', 'back') },
    { key: 'CommandOrControl+Right', action: () => win?.webContents.send('music-process-control', 'forward') },
    { key: 'Escape', action: () => win?.webContents.send('hide-player') },
  ]
  
  for (const { key, action } of shortcuts) {
    try {
      globalShortcut.register(key, action)
    } catch (e) {
      console.log(`Failed to register shortcut ${key}:`, e.message)
    }
  }
}

function updateThumbarButtons(playing) {
  if (!win || process.platform !== 'win32') return
  
  const buttons = [
    {
      tooltip: '上一首',
      icon: nativeImage.createFromPath(path.join(__dirname, '../public/icons/prev.png')),
      click: () => win.webContents.send('music-song-control', 'prev')
    },
    {
      tooltip: playing ? '暂停' : '播放',
      icon: playing 
        ? nativeImage.createFromPath(path.join(__dirname, '../public/icons/pause.png'))
        : nativeImage.createFromPath(path.join(__dirname, '../public/icons/play.png')),
      click: () => win.webContents.send('music-playing-control')
    },
    {
      tooltip: '下一首',
      icon: nativeImage.createFromPath(path.join(__dirname, '../public/icons/next.png')),
      click: () => win.webContents.send('music-song-control', 'next')
    }
  ]
  
  win.setThumbarButtons(buttons)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    const indexPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(__dirname, '../dist/index.html')
    
    console.log('Loading index.html from:', indexPath)
    console.log('app.isPackaged:', app.isPackaged)
    console.log('process.resourcesPath:', process.resourcesPath)
    console.log('__dirname:', __dirname)
    
    win.loadFile(indexPath)
  }
  
  win.on('show', () => {
    updateThumbarButtons(false)
  })
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
    createWindow()
  }
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// 启动网易云 API（借鉴 mrfz 方式：主进程直接加载）
async function startNeteaseApi() {
  try {
    console.log('=== Starting Netease API (main process) ===')
    await serveNcmApi({
      port: 14532,
      host: 'localhost',
    })
    console.log('✅ 网易云音乐 API 服务已启动在 http://localhost:14532')
  } catch (err) {
    console.error('❌ 网易云音乐 API 启动失败:', err.message)
    logError('neteaseApi', err)
  }
}

// 启动 QQ 音乐 API（直接在主进程中加载）
async function startQQMusicApi() {
  try {
    console.log('=== Starting QQ Music API (main process) ===')
    
    // 切换工作目录到 userData，防止 API 写入只读目录报错
    // QQ 音乐 API 可能会尝试写入 cookie 等文件
    const userDataPath = app.getPath('userData')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    
    const originalCwd = process.cwd()
    try {
      process.chdir(userDataPath)
      console.log(`Changed CWD to ${userDataPath} for API startup`)
    } catch (err) {
      console.error('Failed to change CWD:', err)
    }

    // 设置环境变量
    process.env.PORT = '3200'
    process.env.HOST = 'localhost'
    // process.env.NODE_ENV = app.isPackaged ? 'production' : 'development' // 可能不需要，但以防万一
    
    // 直接 require 模块
    // 注意：@sansenjian/qq-music-api 的入口是 index.js，它 require 了 app.js
    // app.js 会自动执行 app.listen
    require('@sansenjian/qq-music-api')
    
    console.log('✅ QQ 音乐 API 服务已启动在 http://localhost:3200')
    
    // 注意：我们不切回 originalCwd，因为 API 可能会在运行时继续读写文件
    // 主进程的其他部分应该使用绝对路径，所以改变 CWD 影响不大
  } catch (err) {
    console.error('❌ QQ 音乐 API 启动失败:', err.message)
    logError('qqMusicApi', err)
  }
}

app.whenReady().then(async () => {
  console.log('=== App Ready ===')
  console.log('Checking ports...')
  
  const neteaseAvailable = await checkPort(NETEASE_PORT)
  const qqAvailable = await checkPort(QQ_MUSIC_PORT)
  console.log(`Port ${NETEASE_PORT} available:`, neteaseAvailable)
  console.log(`Port ${QQ_MUSIC_PORT} available:`, qqAvailable)
  
  // 启动 API 服务
  try {
    await startNeteaseApi()
    console.log('✅ 网易云 API 已启动')
  } catch (error) {
    console.error('⚠️ 网易云 API 启动失败，但继续运行:', error.message)
  }
  
  try {
    await startQQMusicApi()
    console.log('✅ QQ 音乐 API 已启动')
  } catch (error) {
    console.error('⚠️ QQ 音乐 API 启动失败，但继续运行:', error.message)
  }

  ipcMain.handle('cache:get-size', async () => {
    const ses = session.defaultSession
    return new Promise((resolve) => {
      ses.getCacheSize((size) => {
        resolve({
          httpCache: size,
          httpCacheFormatted: formatBytes(size)
        })
      })
    })
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
        await new Promise((resolve, reject) => {
          ses.clearStorageData({ storages }, (error) => {
            if (error) reject(error)
            else resolve()
          })
        })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: error.message })
      }
    }

    if (cache || all) {
      try {
        await new Promise((resolve) => {
          ses.clearCache(() => resolve())
        })
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
        await new Promise((resolve, reject) => {
          ses.clearStorageData({ storages }, (error) => {
            if (error) reject(error)
            else resolve()
          })
        })
        results.success.push(...storages)
      } catch (error) {
        results.failed.push({ type: storages, error: error.message })
      }
    }

    try {
      await new Promise((resolve) => {
        ses.clearCache(() => resolve())
      })
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

  ipcMain.on('minimize-window', () => {
    win?.minimize()
  })

  ipcMain.on('resize-window', (event, { width, height }) => {
    if (!win) return
    const validWidth = Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH))
    const validHeight = Math.max(MIN_HEIGHT, Math.min(height, MAX_HEIGHT))
    win.setSize(validWidth, validHeight)
  })

  ipcMain.on('maximize-window', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('close-window', () => {
    win?.close()
  })
  
  ipcMain.on('music-playing-check', (event, playing) => {
    updateThumbarButtons(playing)
    if (tray) {
      const contextMenu = tray.contextMenu
      if (contextMenu) {
        contextMenu.items[0].visible = !playing
        contextMenu.items[1].visible = playing
      }
    }
  })
  
  ipcMain.on('music-playmode-tray-change', (event, mode) => {
    if (tray) {
      const contextMenu = tray.contextMenu
      if (contextMenu && contextMenu.items[4]?.submenu) {
        contextMenu.items[4].submenu.items.forEach((item, i) => {
          item.checked = i === mode
        })
      }
    }
  })

  createWindow()
  createTray()
  registerShortcuts()
  
  const ses = session.defaultSession
  ses.clearCache(() => {
    console.log('Startup: HTTP cache cleared')
  })
  
  ses.clearStorageData({
    storages: ['sessionstorage', 'serviceworkers', 'shadercache', 'websql', 'indexeddb']
  }, (error) => {
    if (error) {
      console.error('Startup: Failed to clear storage data:', error)
    } else {
      console.log('Startup: Temporary storage cleared (preserved localStorage and cookies)')
    }
  })
})
