import { app, BrowserWindow, ipcMain, nativeImage, session, Tray, Menu, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import Store from 'electron-store'

const store = new Store()

const MIN_WIDTH = 400
const MIN_HEIGHT = 80
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160

// Paths and environment variables setup
const MAIN_DIST = path.join(__dirname, '../dist-electron')
const RENDERER_DIST = path.join(__dirname, '../dist')

process.env.DIST = RENDERER_DIST
const VITE_PUBLIC = app.isPackaged ? RENDERER_DIST : path.join(__dirname, '../public')
process.env.VITE_PUBLIC = VITE_PUBLIC

import { downloadManager } from './DownloadManager'
import { desktopLyricManager } from './DesktopLyricManager'

export class WindowManager {
  private win: BrowserWindow | null = null
  private tray: Tray | null = null
  private contextMenu: Menu | null = null
  private lastSize: { width: number; height: number } | null = null

  constructor() {
    this.initIpc()
    const size = store.get('windowSize') as { width: number; height: number } | undefined
    if (size) {
      this.lastSize = size
    }
  }

  createWindow() {
    const width = this.lastSize ? this.lastSize.width : 1200
    const height = this.lastSize ? this.lastSize.height : 800

    this.win = new BrowserWindow({
      width: width,
      height: height,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      titleBarStyle: 'hidden',
      icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
      webPreferences: {
        preload: path.join(MAIN_DIST, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: false,
      },
    })

    // 初始化下载管理器
    downloadManager.setWindow(this.win)
    downloadManager.init()

    this.win.webContents.on('did-finish-load', () => {
      this.win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      this.win.loadURL(process.env.VITE_DEV_SERVER_URL)
      this.win.webContents.openDevTools()
    } else {
      const indexPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
        : path.join(__dirname, '../dist/index.html')
      
      console.log('Loading index.html from:', indexPath)
      
      this.win.loadFile(indexPath)
    }
    
    this.win.on('show', () => {
      this.updateThumbarButtons(false)
    })

    this.win.on('closed', () => {
      this.win = null
    })

    this.win.on('resize', () => {
      if (this.win && !this.win.isMaximized() && !this.win.isMinimized()) {
        const [width, height] = this.win.getSize()
        this.lastSize = { width, height }
        store.set('windowSize', { width, height })
      }
    })
  }

  getWindow() {
    return this.win
  }

  show() {
    this.win?.show()
    this.win?.focus()
  }

  minimize() {
    this.win?.minimize()
  }

  maximize() {
    if (this.win?.isMaximized()) {
      this.win.unmaximize()
    } else {
      this.win?.maximize()
    }
  }

  close() {
    this.win?.close()
  }

  restore() {
    if (this.win?.isMinimized()) this.win.restore()
    this.win?.focus()
  }

  send(channel: string, ...args: any[]) {
    this.win?.webContents.send(channel, ...args)
  }

  setTray(tray: Tray, contextMenu: Menu) {
    this.tray = tray
    this.contextMenu = contextMenu
  }

  updateThumbarButtons(playing: boolean) {
    if (!this.win || process.platform !== 'win32') return
    
    const iconsPath = process.env.VITE_PUBLIC || path.join(__dirname, '../public')

    const buttons = [
      {
        tooltip: '上一首',
        icon: nativeImage.createFromPath(path.join(iconsPath, 'icons/prev.png')),
        click: () => this.send('music-song-control', 'prev')
      },
      {
        tooltip: playing ? '暂停' : '播放',
        icon: playing 
          ? nativeImage.createFromPath(path.join(iconsPath, 'icons/pause.png'))
          : nativeImage.createFromPath(path.join(iconsPath, 'icons/play.png')),
        click: () => this.send('music-playing-control')
      },
      {
        tooltip: '下一首',
        icon: nativeImage.createFromPath(path.join(iconsPath, 'icons/next.png')),
        click: () => this.send('music-song-control', 'next')
      }
    ]
    
    this.win.setThumbarButtons(buttons)
  }

  initIpc() {
    ipcMain.on('minimize-window', () => this.minimize())

    ipcMain.on('resize-window', (event, { width, height }) => {
      if (!this.win) return
      
      // Get current display work area size to prevent exceeding screen bounds
      const display = screen.getPrimaryDisplay()
      const { width: maxWidth, height: maxHeight } = display.workAreaSize
      
      const validWidth = Math.max(MIN_WIDTH, Math.min(width, maxWidth))
      const validHeight = Math.max(MIN_HEIGHT, Math.min(height, maxHeight))
      this.win.setSize(validWidth, validHeight)
    })

    ipcMain.on('maximize-window', () => this.maximize())

    ipcMain.on('close-window', () => this.close())
    
    ipcMain.on('music-playing-check', (event, playing) => {
      this.updateThumbarButtons(playing)
      if (this.contextMenu) {
        if (this.contextMenu.items.length >= 2) {
            this.contextMenu.items[0].visible = !playing
            this.contextMenu.items[1].visible = playing
        }
      }
    })
    
    ipcMain.on('music-playmode-tray-change', (event, mode) => {
      if (this.contextMenu) {
        // In main.js: contextMenu.items[4].submenu.items
        // item 4 is '播放模式' (index 4 because: 0,1,2, separator(3), 4)
        if (this.contextMenu.items[4]?.submenu) {
          this.contextMenu.items[4].submenu.items.forEach((item, i) => {
            item.checked = i === mode
          })
        }
      }
    })
    ipcMain.on('toggle-desktop-lyric', () => {
      // Toggle logic
      desktopLyricManager.toggle()
    })
  }
}

export const windowManager = new WindowManager()
