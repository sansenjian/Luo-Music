import path from 'node:path'
import type { BrowserWindow, IpcMainEvent } from 'electron'

import { windowManager } from './WindowManager'
import { MAIN_DIST, RENDERER_DIST } from './utils/paths'

const getElectron = (): typeof import('electron') =>
  require('electron') as typeof import('electron')

type ElectronStoreInstance = {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

let store: ElectronStoreInstance | null = null

function getStore(): ElectronStoreInstance {
  if (!store) {
    const StoreModule = require('electron-store') as {
      default?: new (options?: { projectName: string }) => ElectronStoreInstance
    }
    const Store =
      StoreModule.default ??
      (StoreModule as unknown as new (options?: { projectName: string }) => ElectronStoreInstance)

    store = new Store({ projectName: 'luo-music' })
  }

  return store
}

interface LyricUpdateData {
  time: number
  index: number
  text: string
  trans: string
  roma: string
  playing?: boolean
}

interface CreateWindowOptions {
  showOnReady?: boolean
}

export class DesktopLyricManager {
  private win: BrowserWindow | null = null
  private isLocked = false
  private lastPosition: { x: number; y: number } | null = null
  private shouldShowOnReady = false
  private isWindowReady = false

  constructor() {
    this.initIpc()
    const position = getStore().get('desktopLyricPosition') as { x: number; y: number } | undefined

    if (position) {
      this.lastPosition = position
    }
  }

  createWindow(options: CreateWindowOptions = {}): void {
    const { showOnReady = true } = options

    if (this.win && !this.win.isDestroyed()) {
      this.shouldShowOnReady = showOnReady
      if (showOnReady && this.isWindowReady) {
        this.win.show()
      }
      return
    }

    this.shouldShowOnReady = showOnReady
    this.isWindowReady = false

    const { BrowserWindow, screen } = getElectron()
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize
    const x = this.lastPosition ? this.lastPosition.x : Math.floor((width - 800) / 2)
    const y = this.lastPosition ? this.lastPosition.y : Math.floor(height - 180)

    const win = new BrowserWindow({
      width: 800,
      height: 150,
      x,
      y,
      minWidth: 400,
      minHeight: 120,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      show: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true,
      webPreferences: {
        preload: path.join(MAIN_DIST, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: false
      }
    })
    this.win = win

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.once('ready-to-show', () => {
      this.isWindowReady = true
      if (!win.isDestroyed() && this.shouldShowOnReady) {
        win.show()
      }
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/desktop-lyric`)
    } else {
      win.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'desktop-lyric' })
    }

    win.on('closed', () => {
      this.isWindowReady = false
      this.win = null
    })

    win.on('move', () => {
      const [nextX, nextY] = win.getPosition()
      this.lastPosition = { x: nextX, y: nextY }
      getStore().set('desktopLyricPosition', this.lastPosition)
    })

    this.setLocked(false)
  }

  prewarmWindow(): void {
    if (this.win && !this.win.isDestroyed()) {
      return
    }

    this.createWindow({ showOnReady: false })
  }

  closeWindow(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.shouldShowOnReady = false
      this.win.close()
    }
  }

  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.createWindow({ showOnReady: true })
      return
    }

    this.shouldShowOnReady = true
    if (this.isWindowReady) {
      this.win.show()
    }
  }

  hide(): void {
    this.shouldShowOnReady = false
    this.win?.hide()
  }

  setLocked(locked: boolean): void {
    this.isLocked = locked

    if (!this.win || this.win.isDestroyed()) {
      return
    }

    this.win.setIgnoreMouseEvents(locked, { forward: true })
    this.win.webContents.send('desktop-lyric-lock-state', { locked })
  }

  setAlwaysOnTop(alwaysOnTop: boolean): void {
    if (!this.win || this.win.isDestroyed()) {
      return
    }

    this.win.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'screen-saver' : 'normal')
  }

  sendLyric(data: LyricUpdateData): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('lyric-time-update', data)
    }
  }

  toggle(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.closeWindow()
      return
    }

    this.show()
  }

  // Methods for IPC handlers
  toggleLock(): void {
    this.setLocked(!this.isLocked)
  }

  move(x: number, y: number): void {
    if (this.win && !this.win.isDestroyed()) {
      const [currentX, currentY] = this.win.getPosition()
      this.win.setPosition(currentX + x, currentY + y)
    }
  }

  setIgnoreMouse(ignore: boolean): void {
    if (!this.win || this.win.isDestroyed()) {
      return
    }

    this.win.setIgnoreMouseEvents(ignore, { forward: true })
  }

  initIpc(): void {
    const { ipcMain } = getElectron()

    ipcMain.on('music-playing-control', (_event: IpcMainEvent, ...args: unknown[]) => {
      windowManager.send('music-playing-control', ...args)
    })

    ipcMain.on('music-song-control', (_event: IpcMainEvent, ...args: unknown[]) => {
      windowManager.send('music-song-control', ...args)
    })
  }
}

export const desktopLyricManager = new DesktopLyricManager()
