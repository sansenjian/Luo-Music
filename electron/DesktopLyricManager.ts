import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'node:path'
import { windowManager } from './WindowManager'
import Store from 'electron-store'

const store = new Store()

const VITE_PUBLIC = process.env.VITE_PUBLIC || path.join(__dirname, '../public')
const MAIN_DIST = path.join(__dirname, '../dist-electron')

export class DesktopLyricManager {
  private win: BrowserWindow | null = null
  private isLocked: boolean = false
  private lastPosition: { x: number; y: number } | null = null

  constructor() {
    this.initIpc()
    const pos = store.get('desktopLyricPosition') as { x: number; y: number } | undefined
    if (pos) {
      this.lastPosition = pos
    }
  }

  createWindow() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    // Use last position if available, otherwise default position
    const x = this.lastPosition ? this.lastPosition.x : Math.floor((width - 800) / 2)
    const y = this.lastPosition ? this.lastPosition.y : Math.floor(height - 180)

    this.win = new BrowserWindow({
      width: 800,
      height: 150, // 增加高度
      x: x,
      y: y,
      minWidth: 400,
      minHeight: 120,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true, 
      webPreferences: {
        preload: path.join(MAIN_DIST, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: false,
      },
    })

    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // Load the desktop lyric route
    if (process.env.VITE_DEV_SERVER_URL) {
      this.win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/desktop-lyric`)
    } else {
      // In production, we need to load index.html and then navigate
      // Or use query params if router supports it
      const indexPath = process.env.VITE_PUBLIC 
        ? path.join(process.env.VITE_PUBLIC, 'index.html') 
        : path.join(__dirname, '../dist/index.html')
      
      this.win.loadFile(indexPath, { hash: 'desktop-lyric' })
    }

    this.win.on('closed', () => {
      this.win = null
    })

    // Save position on move
    this.win.on('move', () => {
      if (this.win) {
        const [x, y] = this.win.getPosition()
        this.lastPosition = { x, y }
        store.set('desktopLyricPosition', { x, y })
      }
    })

    // Forward mouse events if needed (ignore mouse events when locked)
    this.setLocked(false)
  }

  closeWindow() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close()
    }
  }

  show() {
    if (!this.win || this.win.isDestroyed()) {
      this.createWindow()
    } else {
      this.win.show()
    }
  }

  hide() {
    this.win?.hide()
  }

  setLocked(locked: boolean) {
    this.isLocked = locked
    if (this.win) {
      this.win.setIgnoreMouseEvents(locked, { forward: true })
      // Notify renderer about lock state
      this.win.webContents.send('desktop-lyric-lock-state', locked)
      
      // When locked, we might want to make it "click-through" completely
      // setIgnoreMouseEvents(true) makes it click-through.
      // But we pass { forward: true } to allow hovering detection if needed (e.g. to show unlock button)
      // Actually, if we want to show unlock button on hover, we need to handle mouse events carefully.
      // For now, let's assume locked = click-through.
    }
  }

  sendLyric(data: any) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('lyric-time-update', data)
    }
  }

  toggle() {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.closeWindow()
    } else {
      this.show()
    }
  }

  initIpc() {
    ipcMain.on('desktop-lyric-control', (event, action) => {
      switch (action) {
        case 'show':
          this.show()
          break
        case 'hide':
          this.hide()
          break
        case 'close':
          this.closeWindow()
          break
        case 'lock':
          this.setLocked(true)
          break
        case 'unlock':
          this.setLocked(false)
          break
      }
    })

    // Forward lyric data from main window to desktop lyric window
    ipcMain.on('lyric-time-update', (event, data) => {
      this.sendLyric(data)
    })
    
    // Allow desktop lyric window to toggle lock state
    ipcMain.on('toggle-desktop-lyric-lock', () => {
        this.setLocked(!this.isLocked)
    })

    // Dynamic mouse event handling from renderer
    ipcMain.on('desktop-lyric-set-ignore-mouse', (event, ignore, options) => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.setIgnoreMouseEvents(ignore, options)
      }
    })

    // Forward music control events from desktop lyric to main window
    ipcMain.on('music-playing-control', (event, ...args) => {
      windowManager.send('music-playing-control', ...args)
    })
    ipcMain.on('music-song-control', (event, ...args) => {
      windowManager.send('music-song-control', ...args)
    })
  }
}

export const desktopLyricManager = new DesktopLyricManager()
