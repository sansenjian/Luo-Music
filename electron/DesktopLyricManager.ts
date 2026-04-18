import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { SongPlatform } from '@/types/schemas'
import type { DesktopLyricUpdateCause } from './ipc/types'
import { RECEIVE_CHANNELS, type ReceiveChannel } from './shared/protocol/channels'

import { MAIN_DIST, RENDERER_DIST } from './utils/paths'

const getElectron = (): typeof import('electron') =>
  require('electron') as typeof import('electron')

type ElectronStoreInstance = {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

let store: ElectronStoreInstance | null = null
const DESKTOP_LYRIC_RENDERER_CHANNELS = new Set<ReceiveChannel>([
  RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE,
  RECEIVE_CHANNELS.LYRIC_TIME_UPDATE
])

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
  songId?: string | number | null
  platform?: SongPlatform | null
  sequence?: number
  cause?: DesktopLyricUpdateCause
}

interface CreateWindowOptions {
  showOnReady?: boolean
}

export const DESKTOP_LYRIC_HASH_ROUTE = '/desktop-lyric'

/**
 * Determines whether a given flag string enables desktop lyric debugging.
 *
 * @param flag - The flag value to evaluate (commonly an environment variable); recognized enabling values are `1`, `true`, `on`, and `debug` (case-insensitive).
 * @returns `true` if `flag` matches one of the recognized enabling values, `false` otherwise.
 */
function isDesktopLyricDebugFlagEnabled(flag?: string | null): boolean {
  return /^(1|true|on|debug)$/i.test(flag ?? '')
}

/**
 * Determine whether desktop lyric debug logging is enabled.
 *
 * Debug is enabled if the environment variables `LUO_DESKTOP_LYRIC_DEBUG` or
 * `VITE_DESKTOP_LYRIC_DEBUG` contain a debug flag (e.g., `1`, `true`, `on`, `debug`, case-insensitive).
 * If `NODE_ENV` equals `test`, debugging is disabled. Otherwise debugging is enabled when
 * `NODE_ENV` equals `development` or `VITE_DEV_SERVER_URL` is set.
 *
 * @returns `true` if debug logging should be active, `false` otherwise.
 */
function isDesktopLyricDebugEnabled(): boolean {
  if (
    isDesktopLyricDebugFlagEnabled(process.env.LUO_DESKTOP_LYRIC_DEBUG) ||
    isDesktopLyricDebugFlagEnabled(process.env.VITE_DESKTOP_LYRIC_DEBUG)
  ) {
    return true
  }

  if (process.env.NODE_ENV === 'test') {
    return false
  }

  return process.env.NODE_ENV === 'development' || Boolean(process.env.VITE_DEV_SERVER_URL)
}

/**
 * Emit a debug log for DesktopLyricManager events when debug mode is enabled.
 *
 * @param event - A short identifier or description of the event to log
 * @param details - Optional additional metadata to include with the log
 */
function logDesktopLyricDebug(event: string, details: Record<string, unknown> = {}): void {
  if (!isDesktopLyricDebugEnabled()) {
    return
  }

  console.debug('[DesktopLyricManager]', event, details)
}

/**
 * Build the route used to load the desktop lyric renderer.
 *
 * @param devServerUrl - Optional development server base URL; when provided the result contains a `url` combining this base with the desktop lyric hash route
 * @returns An object with either `url` (full load URL including the desktop lyric hash) when `devServerUrl` is provided, or `hash` (the desktop lyric route fragment) for production file loading
 */
export function getDesktopLyricWindowRoute(devServerUrl?: string): {
  url?: string
  hash?: string
} {
  if (devServerUrl) {
    return {
      url: `${devServerUrl}#${DESKTOP_LYRIC_HASH_ROUTE}`
    }
  }

  return {
    hash: DESKTOP_LYRIC_HASH_ROUTE
  }
}

export class DesktopLyricManager {
  private win: BrowserWindow | null = null
  private isLocked = false
  private lastPosition: { x: number; y: number } | null = null
  private lastLyric: LyricUpdateData | null = null
  private shouldShowOnReady = false
  private isWindowReady = false
  private isRendererReady = false

  private sendToRenderer(channel: string, payload: unknown): boolean {
    if (!DESKTOP_LYRIC_RENDERER_CHANNELS.has(channel as ReceiveChannel)) {
      return false
    }

    if (!this.win || this.win.isDestroyed()) {
      return false
    }

    try {
      this.win.webContents.send(channel, payload)
      return true
    } catch (error) {
      console.error(`[DesktopLyricManager] Failed to send ${channel}`, error)
      return false
    }
  }

  private maybeReplayLastLyric(): void {
    if (!this.isWindowReady || !this.isRendererReady) {
      return
    }

    logDesktopLyricDebug('replay-ready', {
      hasCachedLyric: this.lastLyric !== null
    })
    this.replayLastLyric()
  }

  private canSendLiveLyric(): boolean {
    if (!this.win || this.win.isDestroyed() || !this.isWindowReady) {
      return false
    }

    if (this.isRendererReady) {
      return true
    }

    return typeof this.win.isVisible === 'function' ? this.win.isVisible() : false
  }

  constructor() {
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
    this.isRendererReady = false

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
        webSecurity: true,
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
      this.maybeReplayLastLyric()
    })

    const route = getDesktopLyricWindowRoute(process.env.VITE_DEV_SERVER_URL)

    if (route.url) {
      void win.loadURL(route.url)
    } else {
      void win.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: route.hash })
    }

    win.on('closed', () => {
      this.isWindowReady = false
      this.isRendererReady = false
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
      // Replay eagerly when reusing a warm window so the current line is visible
      // even if the ready handshake was missed or comes from an older preload.
      this.replayLastLyric()
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
    this.sendToRenderer(RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE, { locked })
  }

  setAlwaysOnTop(alwaysOnTop: boolean): void {
    if (!this.win || this.win.isDestroyed()) {
      return
    }

    this.win.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'screen-saver' : 'normal')
  }

  private replayLastLyric(): void {
    if (!this.lastLyric) {
      return
    }

    logDesktopLyricDebug('replay-last-lyric', {
      source: 'push',
      cause: this.lastLyric.cause ?? 'interval',
      sequence: this.lastLyric.sequence ?? 0,
      songId: this.lastLyric.songId ?? null,
      platform: this.lastLyric.platform ?? null,
      currentTime: this.lastLyric.time,
      currentLyricIndex: this.lastLyric.index
    })
    this.sendToRenderer(RECEIVE_CHANNELS.LYRIC_TIME_UPDATE, this.lastLyric)
  }

  sendLyric(data: LyricUpdateData): void {
    this.lastLyric = data
    if (!this.canSendLiveLyric()) {
      logDesktopLyricDebug('cache-lyric-until-ready', {
        source: 'push',
        cause: data.cause ?? 'interval',
        sequence: data.sequence ?? 0,
        songId: data.songId ?? null,
        platform: data.platform ?? null,
        currentTime: data.time,
        currentLyricIndex: data.index
      })
      return
    }

    logDesktopLyricDebug('send-live-lyric', {
      source: 'push',
      cause: data.cause ?? 'interval',
      sequence: data.sequence ?? 0,
      songId: data.songId ?? null,
      platform: data.platform ?? null,
      currentTime: data.time,
      currentLyricIndex: data.index
    })
    this.sendToRenderer(RECEIVE_CHANNELS.LYRIC_TIME_UPDATE, data)
  }

  toggle(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.closeWindow()
      return
    }

    this.show()
  }

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

  onRendererReady(): void {
    this.isRendererReady = true
    logDesktopLyricDebug('renderer-ready', {
      isWindowReady: this.isWindowReady,
      hasCachedLyric: this.lastLyric !== null
    })
    this.maybeReplayLastLyric()
  }
}

export const desktopLyricManager = new DesktopLyricManager()
