import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

// The built directory structure
//
// ├─┬─ dist
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
// ├─┬─ dist-electron
// │ ├── main.js
// │ └── preload.js
//
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win

// 窗口尺寸限制
const MIN_WIDTH = 400
const MIN_HEIGHT = 80
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // 启用安全策略
      allowRunningInsecureContent: false,
    },
  })

  // Test active push message to Renderer-process.
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

// Quit when all windows are closed
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

// 处理第二个实例启动
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(() => {
  createWindow()

  ipcMain.on('minimize-window', () => {
    win?.minimize()
  })

  ipcMain.on('resize-window', (event, { width, height }) => {
    if (!win) return
    
    // 验证窗口尺寸
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
