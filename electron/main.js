import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const { dirname } = path
const __dirname = dirname(fileURLToPath(import.meta.url))

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

// 定义构建输出目录
const MAIN_DIST = __dirname  // dist-electron 目录
const RENDERER_DIST = path.join(__dirname, '../dist')  // dist 目录

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = app.isPackaged ? RENDERER_DIST : path.join(__dirname, '../public')

let win
let serverProcess = null  // 保存 QQ 音乐 API 进程引用

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
    // 生产环境：从 asar 包中加载
    const indexPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(__dirname, '../dist/index.html')
    
    console.log('Loading index.html from:', indexPath)
    console.log('app.isPackaged:', app.isPackaged)
    console.log('process.resourcesPath:', process.resourcesPath)
    console.log('__dirname:', __dirname)
    
    win.loadFile(indexPath)
    
    // 生产环境也打开 DevTools 便于调试
    win.webContents.openDevTools()
  }
}

app.on('window-all-closed', async () => {
  if (serverProcess) {
    console.log('Stopping API server...')
    
    // 先尝试优雅关闭（给进程发送 SIGTERM）
    serverProcess.kill('SIGTERM')
    
    // 等待 3 秒，如果还没退出则强制 kill
    setTimeout(() => {
      if (!serverProcess.killed) {
        console.warn('Force killing API server...')
        serverProcess.kill('SIGKILL')
      }
    }, 3000)
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // 确保 server 进程被终止
  if (serverProcess) {
    serverProcess.kill()
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

// 启动 API 服务（使用 spawn 启动 server.cjs 作为独立进程）
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // 关键修复：使用 spawn 启动 server.cjs，确保 CommonJS 环境
      const serverPath = app.isPackaged
        ? path.join(process.resourcesPath, 'server.cjs')
        : path.join(__dirname, '../server.cjs')
      
      console.log('=== Starting Server Process ===')
      console.log('Server path:', serverPath)
      console.log('Is packaged:', app.isPackaged)
      console.log('process.resourcesPath:', process.resourcesPath)
      console.log('')
      
      if (!fs.existsSync(serverPath)) {
        console.error('❌ Server file not found:', serverPath)
        reject(new Error('Server file not found'))
        return
      }
      
      // 开发模式使用系统 node，生产模式使用 Electron 自带的 node
      const nodePath = app.isPackaged 
        ? process.execPath 
        : 'node'
      
      // 使用 spawn 启动 server.cjs 作为独立 Node.js 进程
      serverProcess = spawn(nodePath, [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: app.isPackaged ? 'production' : 'development',
          ELECTRON_RUN_AS_NODE: '1'
        },
        cwd: path.dirname(serverPath),
        shell: process.platform === 'win32',
        windowsHide: true
      })

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim()
        console.log('[Server]', output)
        
        // 检测服务器启动完成
        if (output.includes('API 服务已启动') || output.includes('server running')) {
          console.log('✅ Server is ready')
          resolve()
        }
      })
      
      serverProcess.stderr.on('data', (data) => {
        console.error('[Server Error]', data.toString().trim())
      })
      
      serverProcess.on('close', (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`⚠️ Server 异常退出，code: ${code}, signal: ${signal}`)
          reject(new Error(`Server exited with code ${code}`))
        } else {
          console.log('Server 已正常关闭')
        }
      })
      
      serverProcess.on('error', (err) => {
        console.error('❌ Server 进程错误:', err)
        reject(err)
      })
      
      // 设置超时，如果 10 秒后还没启动成功也继续
      setTimeout(() => {
        resolve()
      }, 10000)
      
    } catch (error) {
      console.error('⚠️ API 启动错误（应用将继续运行）:', error.message)
      resolve() // 即使失败也继续启动应用
    }
  })
}

app.whenReady().then(async () => {
  // 启动 API 服务并等待就绪
  try {
    await startServer()
    console.log('✅ Server is ready, creating window...')
  } catch (error) {
    console.error('⚠️ Server startup failed, but continuing:', error.message)
  }
  
  // 注册缓存管理 IPC 处理程序（必须在 createWindow 之前）
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

  // 窗口控制
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

  // 创建窗口
  createWindow()
  
  // 启动后清理缓存（保留用户数据）- 在窗口创建后异步执行
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
