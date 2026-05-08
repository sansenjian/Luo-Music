import type {
  BrowserWindow as BrowserWindowType,
  Menu as MenuType,
  Tray as TrayType,
  Rectangle,
  WebContents as WebContentsType
} from 'electron'
import { BrowserWindow, nativeImage } from 'electron'
import path from 'node:path'

import { downloadManager } from './DownloadManager'
import logger from './logger'
import { getWindowsShellIdentity } from './main/app'
import { RECEIVE_CHANNELS } from '@shared/protocol/channels'
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
const WINDOWS_APP_ICON_FILE = 'tray.ico'
const PACKAGED_RENDERER_STALL_RETRY_DELAY_MS = 3000
const DEV_RENDERER_STALL_WARNING_DELAY_MS = 30000

process.env.DIST = RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

function isBrowserWindowDestroyed(win: BrowserWindowType): boolean {
  try {
    return win.isDestroyed()
  } catch {
    return true
  }
}

function isWebContentsDestroyed(webContents: WebContentsType): boolean {
  try {
    return webContents.isDestroyed()
  } catch {
    return true
  }
}

function getRendererUrl(webContents: WebContentsType): string | null {
  if (isWebContentsDestroyed(webContents)) {
    return null
  }

  try {
    return webContents.getURL()
  } catch (error) {
    logger.warn('[WindowManager] Failed to read renderer URL', error)
    return null
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}

export class WindowManager {
  private win: BrowserWindowType | null = null
  private tray: TrayType | null = null
  private contextMenu: MenuType | null = null
  private lastSize: { width: number; height: number } | null = null

  constructor() {
    const size = store.get('windowSize') as { width: number; height: number } | undefined

    if (size) {
      this.lastSize = size
    }
  }

  createWindow(): void {
    const startedAt = Date.now()
    const width = this.lastSize ? this.lastSize.width : 1200
    const height = this.lastSize ? this.lastSize.height : 800
    const devServerUrl = process.env.VITE_DEV_SERVER_URL
    const indexPath = path.join(RENDERER_DIST, 'index.html')
    const loadTarget = devServerUrl ?? indexPath
    logger.info('[WindowManager] Creating main window', {
      width,
      height,
      loadTarget
    })
    const win = new BrowserWindow({
      width,
      height,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      // Keep the frameless shell flush to the window bounds on Windows.
      // `roundedCorners: false` removes the rounded cut-outs, while
      // `thickFrame: false` removes the native resize frame that shows up as
      // empty space around the four corners.
      ...(process.platform === 'win32'
        ? {
            roundedCorners: false,
            thickFrame: false
          }
        : {}),
      titleBarStyle: 'hidden',
      icon: path.join(VITE_PUBLIC, 'electron-vite.svg'),
      show: false,
      transparent: false,
      backgroundColor: '#101014',
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
    const webContents = win.webContents
    this.applyWindowsAppDetails(win)

    let hasRecoveredRenderer = false
    let hasShownWindow = false
    let rendererStallTimer: ReturnType<typeof setTimeout> | null = null

    const clearRendererStallTimer = (): void => {
      if (!rendererStallTimer) {
        return
      }

      clearTimeout(rendererStallTimer)
      rendererStallTimer = null
    }

    const recoverRenderer = (reason: string, details: Record<string, unknown>): void => {
      logger.error('[WindowManager] Renderer load issue', { reason, ...details })

      if (hasRecoveredRenderer || isBrowserWindowDestroyed(win)) {
        return
      }

      hasRecoveredRenderer = true
      setTimeout(() => {
        if (isBrowserWindowDestroyed(win)) {
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

    const showWindow = (reason: string): void => {
      if (hasShownWindow || isBrowserWindowDestroyed(win)) {
        return
      }

      hasShownWindow = true
      clearRendererStallTimer()
      logger.info(`[WindowManager] Showing main window (${reason})`, {
        elapsed: formatDuration(Date.now() - startedAt)
      })
      win.show()
    }

    const rendererStallDelay = devServerUrl
      ? DEV_RENDERER_STALL_WARNING_DELAY_MS
      : PACKAGED_RENDERER_STALL_RETRY_DELAY_MS

    rendererStallTimer = setTimeout(() => {
      if (isBrowserWindowDestroyed(win) || win.isVisible()) {
        return
      }

      if (devServerUrl) {
        logger.warn('[WindowManager] Dev renderer is still compiling before first show', {
          elapsed: formatDuration(Date.now() - startedAt),
          loadTarget
        })
        return
      }

      logger.warn('[WindowManager] Renderer readiness stalled before first show; retrying load', {
        elapsed: formatDuration(Date.now() - startedAt),
        loadTarget
      })

      recoverRenderer('startup-renderer-stall', { loadTarget })
    }, rendererStallDelay)

    win.once('ready-to-show', () => {
      logger.info('[WindowManager] ready-to-show', {
        elapsed: formatDuration(Date.now() - startedAt)
      })
      showWindow('ready-to-show')
    })

    downloadManager.setWindow(win)
    downloadManager.init()

    webContents.on('did-start-loading', () => {
      if (isBrowserWindowDestroyed(win) || isWebContentsDestroyed(webContents)) {
        return
      }

      logger.info('[WindowManager] renderer did-start-loading', {
        elapsed: formatDuration(Date.now() - startedAt),
        loadTarget
      })
    })

    webContents.on('dom-ready', () => {
      if (isBrowserWindowDestroyed(win) || isWebContentsDestroyed(webContents)) {
        return
      }

      logger.info('[WindowManager] renderer dom-ready', {
        elapsed: formatDuration(Date.now() - startedAt),
        url: getRendererUrl(webContents)
      })

      if (devServerUrl) {
        showWindow('dom-ready')
      }
    })

    webContents.on('did-finish-load', () => {
      if (isBrowserWindowDestroyed(win) || isWebContentsDestroyed(webContents)) {
        return
      }

      hasRecoveredRenderer = false
      logger.info('[WindowManager] renderer did-finish-load', {
        elapsed: formatDuration(Date.now() - startedAt),
        url: getRendererUrl(webContents)
      })
      webContents.send('main-process-message', new Date().toLocaleString())

      if (devServerUrl && !webContents.isDevToolsOpened()) {
        webContents.openDevTools({ mode: 'detach' })
      }
    })

    webContents.on('did-stop-loading', () => {
      if (isBrowserWindowDestroyed(win) || isWebContentsDestroyed(webContents)) {
        return
      }

      logger.info('[WindowManager] renderer did-stop-loading', {
        elapsed: formatDuration(Date.now() - startedAt),
        url: getRendererUrl(webContents)
      })
    })

    webContents.on(
      'did-fail-load',
      (_event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame) => {
        if (!isMainFrame) {
          return
        }

        logger.error('[WindowManager] renderer did-fail-load', {
          elapsed: formatDuration(Date.now() - startedAt),
          errorCode,
          errorDescription,
          validatedURL
        })
        recoverRenderer('did-fail-load', {
          errorCode,
          errorDescription,
          validatedURL
        })
      }
    )

    webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') {
        return
      }

      logger.error('[WindowManager] render-process-gone', {
        elapsed: formatDuration(Date.now() - startedAt),
        processGoneReason: details.reason,
        exitCode: details.exitCode
      })
      recoverRenderer('render-process-gone', {
        processGoneReason: details.reason,
        exitCode: details.exitCode
      })
    })

    if (devServerUrl) {
      logger.info('[WindowManager] Loading renderer URL', { loadTarget })
      void win.loadURL(devServerUrl)
    } else {
      logger.info('[WindowManager] Loading renderer file', { loadTarget })
      void win.loadFile(indexPath)
    }

    win.on('show', () => {
      this.updateThumbarButtons(false)
    })

    win.on('closed', () => {
      clearRendererStallTimer()
      this.win = null
      downloadManager.setWindow(null)
    })

    win.on('resize', () => {
      if (!win.isMaximized() && !win.isMinimized()) {
        const [nextWidth, nextHeight] = win.getSize()
        this.lastSize = { width: nextWidth, height: nextHeight }
        store.set('windowSize', this.lastSize)
      }
    })
  }

  private applyWindowsAppDetails(win: BrowserWindowType): void {
    const shellIdentity = getWindowsShellIdentity()
    if (!shellIdentity) {
      return
    }

    try {
      win.setAppDetails({
        appId: shellIdentity.appUserModelId,
        appIconPath: path.join(VITE_PUBLIC, WINDOWS_APP_ICON_FILE),
        appIconIndex: 0,
        relaunchCommand: process.execPath,
        relaunchDisplayName: shellIdentity.displayName
      })
    } catch (error) {
      logger.warn('[WindowManager] Failed to set Windows app details', error)
    }
  }

  getWindow(): BrowserWindowType | null {
    return this.win
  }

  getBounds(): Rectangle | null {
    return this.win?.getBounds() ?? null
  }

  setBounds(bounds: Rectangle): void {
    if (!this.win || this.win.isDestroyed()) {
      return
    }

    if (this.win.isMaximized() || this.win.isMinimized() || this.win.isFullScreen()) {
      return
    }

    const currentBounds = this.win.getBounds()
    const nextBounds: Rectangle = {
      x: Math.round(bounds.x ?? currentBounds.x),
      y: Math.round(bounds.y ?? currentBounds.y),
      width: Math.max(MIN_WIDTH, Math.round(bounds.width ?? currentBounds.width)),
      height: Math.max(MIN_HEIGHT, Math.round(bounds.height ?? currentBounds.height))
    }

    this.win.setBounds(nextBounds)
    this.lastSize = { width: nextBounds.width, height: nextBounds.height }
    store.set('windowSize', this.lastSize)
  }

  show(): void {
    this.win?.show()
    this.win?.focus()
  }

  hide(): void {
    this.win?.hide()
  }

  minimize(): void {
    this.win?.minimize()
  }

  minimizeToTray(): void {
    this.hide()
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

  setAlwaysOnTop(alwaysOnTop: boolean): void {
    this.win?.setAlwaysOnTop(alwaysOnTop)
  }

  toggleFullScreen(): void {
    if (!this.win) {
      return
    }

    this.win.setFullScreen(!this.win.isFullScreen())
  }

  restore(): void {
    if (this.win?.isMinimized()) {
      this.win.restore()
    }

    this.win?.focus()
  }

  getWindowState(): {
    isMaximized: boolean
    isMinimized: boolean
    isFullScreen: boolean
    isAlwaysOnTop: boolean
  } {
    return {
      isMaximized: this.win?.isMaximized() ?? false,
      isMinimized: this.win?.isMinimized() ?? false,
      isFullScreen: this.win?.isFullScreen() ?? false,
      isAlwaysOnTop: this.win?.isAlwaysOnTop() ?? false
    }
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.win || isBrowserWindowDestroyed(this.win)) {
      return
    }

    const webContents = this.win.webContents
    if (isWebContentsDestroyed(webContents)) {
      return
    }

    webContents.send(channel, ...args)
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
        click: () => this.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'prev')
      },
      {
        tooltip: playing ? 'Pause' : 'Play',
        icon: playing
          ? nativeImage.createFromPath(path.join(iconsPath, 'icons/pause.png'))
          : nativeImage.createFromPath(path.join(iconsPath, 'icons/play.png')),
        click: () => this.send(RECEIVE_CHANNELS.MUSIC_PLAYING_CONTROL)
      },
      {
        tooltip: 'Next',
        icon: nativeImage.createFromPath(path.join(iconsPath, 'icons/next.png')),
        click: () => this.send(RECEIVE_CHANNELS.MUSIC_SONG_CONTROL, 'next')
      }
    ]

    this.win.setThumbarButtons(buttons)
  }

  syncPlaybackState(playing: boolean): void {
    this.updateThumbarButtons(playing)

    if (this.contextMenu && this.contextMenu.items.length >= 2) {
      this.contextMenu.items[0].visible = !playing
      this.contextMenu.items[1].visible = playing
    }
  }

  syncTrayPlayMode(mode: number): void {
    const playModeMenu = this.contextMenu?.items[4]?.submenu

    if (playModeMenu) {
      playModeMenu.items.forEach((item, index) => {
        item.checked = index === mode
      })
    }
  }
}

export const windowManager = new WindowManager()
