import path from 'node:path'
import { windowManager } from './WindowManager'
import { MAIN_DIST, VITE_PUBLIC } from './utils/paths'

// 延迟获取 electron 模块，确保在 Electron 运行时环境中才执行 require
// 这样可以避免打包时 rollup 对 require('electron') 进行静态分析导致的问题
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getElectron = () => require('electron')
type BrowserWindowType = InstanceType<ReturnType<typeof getElectron>['BrowserWindow']>
type IpcMainType = ReturnType<typeof getElectron>['ipcMain']
type IpcMainEvent = Parameters<Parameters<IpcMainType['on']>[1]>[0]

// 延迟初始化 electron-store
let store: ReturnType<typeof import('electron-store').default> | null = null
const getStore = () => {
  if (!store) {
    const StoreModule = require('electron-store')
    const Store = StoreModule.default || StoreModule
    store = new Store({ projectName: 'luo-music' })
  }
  return store
}

/** 桌面歌词数据结构 */
interface LyricUpdateData {
  time: number
  index: number
  text: string
  trans: string
  romalrc: string
}

export class DesktopLyricManager {
  private win: BrowserWindowType | null = null
  private isLocked: boolean = false
  private lastPosition: { x: number; y: number } | null = null

  constructor() {
    this.initIpc()
    const pos = getStore().get('desktopLyricPosition') as { x: number; y: number } | undefined
    if (pos) {
      this.lastPosition = pos
    }
  }

  createWindow() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      return
    }

    const { screen, BrowserWindow } = getElectron()
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
        preload: path.join(MAIN_DIST, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: false,
      },
    })

    // this.win 不会为 null，因为刚创建
    const win = this.win!
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // Load the desktop lyric route
    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/desktop-lyric`)
    } else {
      // In production, we need to load index.html and then navigate
      // Or use query params if router supports it
      const indexPath = process.env.VITE_PUBLIC 
        ? path.join(process.env.VITE_PUBLIC, 'index.html') 
        : path.join(__dirname, '../dist/index.html')
      
      win.loadFile(indexPath, { hash: 'desktop-lyric' })
    }

    win.on('closed', () => {
      this.win = null
    })

    // Save position on move
    win.on('move', () => {
      if (this.win) {
        const [x, y] = this.win.getPosition()
        this.lastPosition = { x, y }
        getStore().set('desktopLyricPosition', { x, y })
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

  sendLyric(data: LyricUpdateData) {
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
    const { ipcMain } = getElectron()
    ipcMain.on('desktop-lyric-control', (event: IpcMainEvent, action: string) => {
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
    ipcMain.on('lyric-time-update', (event: IpcMainEvent, data: LyricUpdateData) => {
      this.sendLyric(data)
    })
    
    // Allow desktop lyric window to toggle lock state
    ipcMain.on('toggle-desktop-lyric-lock', () => {
        this.setLocked(!this.isLocked)
    })

    ipcMain.on('desktop-lyric-move', (event: IpcMainEvent, { x, y }: { x: number; y: number }) => {
      if (this.win && !this.win.isDestroyed()) {
        const [currentX, currentY] = this.win.getPosition()
        this.win.setPosition(currentX + x, currentY + y)
        // 移动事件会触发 'move' 监听器，自动保存位置
      }
    })

    // Dynamic mouse event handling from renderer
    ipcMain.on('desktop-lyric-set-ignore-mouse', (event: IpcMainEvent, ignore: boolean, options?: { forward: boolean }) => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.setIgnoreMouseEvents(ignore, options)
      }
    })

    // Forward music control events from desktop lyric to main window
    ipcMain.on('music-playing-control', (event: IpcMainEvent, ...args: unknown[]) => {
      windowManager.send('music-playing-control', ...args)
    })
    ipcMain.on('music-song-control', (event: IpcMainEvent, ...args: unknown[]) => {
      windowManager.send('music-song-control', ...args)
    })
  }
}

export const desktopLyricManager = new DesktopLyricManager()
