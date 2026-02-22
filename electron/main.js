import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

// 全局错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Avoid 'hit restricted' error in sandbox environment by redirecting userData
if (!app.isPackaged) {
  const userDataPath = path.join(__dirname, '../.userData')
  app.setPath('userData', userDataPath)
}

process.env.DIST = path.join(__dirname, '../dist-electron')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win

// 窗口尺寸限制
const MIN_WIDTH = 400
const MIN_HEIGHT = 80
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
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
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
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

// 缓存管理 IPC 处理程序
ipcMain.handle('cache:get-size', async () => {
  return new Promise((resolve) => {
    session.defaultSession.getCacheSize((size) => {
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

  // 清理 HTTP 缓存
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

app.whenReady().then(() => {
  createWindow()

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
})
