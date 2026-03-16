import type {
  BrowserWindow as BrowserWindowType,
  IpcMainEvent,
  Menu as MenuType,
  Tray as TrayType
} from 'electron'
import { BrowserWindow, ipcMain, nativeImage, screen } from 'electron'
import path from 'node:path'

import { downloadManager } from './DownloadManager'
import logger from './logger'
import { MAIN_DIST, RENDERER_DIST, VITE_PUBLIC } from './utils/paths'
const StoreModule = require('electron-store') as {
  default?: new (options?: { projectName: string }) => {
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
}
const Store =
  StoreModule.default ??
  (StoreModule as unknown as new (options?: { projectName: string }) => {
    get(key: string): unknown
    set(key: string, value: unknown): void
  })
const store = new Store({
  projectName: 'luo-music'
})

const MIN_WIDTH = 400
const MIN_HEIGHT = 80
const LOAD_RETRY_DELAY_MS = 1000

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

export class WindowManager {
  private win: BrowserWindowType | null = null
  private tray: TrayType | null = null
  private contextMenu: MenuType | null = null
  private lastSize: { width: number; height: number } | null = null

  constructor() {
    this.initIpc()
    const size = store.get('windowSize') as { width: number; height: number } | undefined

    if (size) {
      this.lastSize = size
    }
  }

  createWindow(): void {
    const width = this.lastSize ? this.lastSize.width : 1200
    const height = this.lastSize ? this.lastSize.height : 800
    const devServerUrl = process.env.VITE_DEV_SERVER_URL
    const indexPath = path.join(RENDERER_DIST, 'index.html')
    const win = new BrowserWindow({
      width,
      height,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      titleBarStyle: 'hidden',
      icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
      show: false,
      backgroundColor: '#e8ecef',
      webPreferences: {
        preload: path.join(MAIN_DIST, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
        spellcheck: false,
        enableWebSQL: false
      }
    })
    this.win = win

    let hasRecoveredRenderer = false

    const recoverRenderer = (reason: string, details: Record<string, unknown>): void => {
      logger.error('[WindowManager] Renderer load issue', { reason, ...details })

      if (hasRecoveredRenderer || win.isDestroyed()) {
        return
      }

      hasRecoveredRenderer = true
      setTimeout(() => {
        if (win.isDestroyed()) {
          return
        }

        logger.warn('[WindowManager] Retrying renderer load', {
          reason,
          target: devServerUrl ?? indexPath
        })

        if (devServerUrl) {
          void win.loadURL(devServerUrl)
          return
        }

        void win.loadFile(indexPath)
      }, LOAD_RETRY_DELAY_MS)
    }

    win.once('ready-to-show', () => {
      win.show()
    })

    downloadManager.setWindow(win)
    downloadManager.init()

    win.webContents.on('did-finish-load', () => {
      hasRecoveredRenderer = false
      win.webContents.send('main-process-message', new Date().toLocaleString())
    })

    win.webContents.on(
      'did-fail-load',
      (_event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame) => {
        if (!isMainFrame) {
          return
        }

        recoverRenderer('did-fail-load', {
          errorCode,
          errorDescription,
          validatedURL
        })
      }
    )

    win.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') {
        return
      }

      recoverRenderer('render-process-gone', {
        processGoneReason: details.reason,
        exitCode: details.exitCode
      })
    })

    if (devServerUrl) {
      win.loadURL(devServerUrl)
      win.webContents.openDevTools()
    } else {
      win.loadFile(indexPath)
    }

    win.on('show', () => {
      this.updateThumbarButtons(false)
    })

    win.on('closed', () => {
      this.win = null
    })

    win.on('resize', () => {
      if (!win.isMaximized() && !win.isMinimized()) {
        const [nextWidth, nextHeight] = win.getSize()
        this.lastSize = { width: nextWidth, height: nextHeight }
        store.set('windowSize', this.lastSize)
      }
    })
  }

  getWindow(): BrowserWindowType | null {
    return this.win
  }

  show(): void {
    this.win?.show()
    this.win?.focus()
  }

  minimize(): void {
    this.win?.minimize()
  }

  maximize(): void {
    if (this.win?.isMaximized()) {
      this.win.unmaximize()
      return
    }

    this.win?.maximize()
  }

  close(): void {
    this.win?.close()
  }

  restore(): void {
    if (this.win?.isMinimized()) {
      this.win.restore()
    }

    this.win?.focus()
  }

  send(channel: string, ...args: unknown[]): void {
    this.win?.webContents.send(channel, ...args)
  }

  setTray(tray: TrayType, contextMenu: MenuType): void {
    this.tray = tray
    this.contextMenu = contextMenu
  }

  updateThumbarButtons(playing: boolean): void {
    if (!this.win || process.platform !== 'win32') {
      return
    }

    const iconsPath = process.env.VITE_PUBLIC || path.join(__dirname, '../public')
    const buttons = [
      {
        tooltip: 'Previous',
        icon: nativeImage.createFromPath(path.join(iconsPath, 'icons/prev.png')),
        click: () => this.send('music-song-control', 'prev')
      },
      {
        tooltip: playing ? 'Pause' : 'Play',
        icon: playing
          ? nativeImage.createFromPath(path.join(iconsPath, 'icons/pause.png'))
          : nativeImage.createFromPath(path.join(iconsPath, 'icons/play.png')),
        click: () => this.send('music-playing-control')
      },
      {
        tooltip: 'Next',
        icon: nativeImage.createFromPath(path.join(iconsPath, 'icons/next.png')),
        click: () => this.send('music-song-control', 'next')
      }
    ]

    this.win.setThumbarButtons(buttons)
  }

  initIpc(): void {
    ipcMain.on('minimize-window', () => this.minimize())

    ipcMain.on(
      'resize-window',
      (_event: IpcMainEvent, { width, height }: { width: number; height: number }) => {
        if (!this.win) {
          return
        }

        const display = screen.getPrimaryDisplay()
        const { width: maxWidth, height: maxHeight } = display.workAreaSize
        const validWidth = Math.max(MIN_WIDTH, Math.min(width, maxWidth))
        const validHeight = Math.max(MIN_HEIGHT, Math.min(height, maxHeight))

        this.win.setSize(validWidth, validHeight)
      }
    )

    ipcMain.on('maximize-window', () => this.maximize())
    ipcMain.on('close-window', () => this.close())

    ipcMain.on('music-playing-check', (_event: IpcMainEvent, playing: boolean) => {
      this.updateThumbarButtons(playing)

      if (this.contextMenu && this.contextMenu.items.length >= 2) {
        this.contextMenu.items[0].visible = !playing
        this.contextMenu.items[1].visible = playing
      }
    })

    ipcMain.on('music-playmode-tray-change', (_event: IpcMainEvent, mode: number) => {
      const playModeMenu = this.contextMenu?.items[4]?.submenu

      if (playModeMenu) {
        playModeMenu.items.forEach((item, index) => {
          item.checked = index === mode
        })
      }
    })
  }
}

export const windowManager = new WindowManager()
