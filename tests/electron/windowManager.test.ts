import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserWindowInstances: BrowserWindowMock[] = []
const ipcMainOn = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()
const setWindowMock = vi.fn()
const initDownloadManagerMock = vi.fn()
const appQuitMock = vi.fn()

class BrowserWindowMock {
  public events: Record<string, (...args: unknown[]) => void> = {}
  public webContentsEvents: Record<string, (...args: unknown[]) => void> = {}
  public webContents = {
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      this.webContentsEvents[event] = callback
    }),
    openDevTools: vi.fn(),
    send: vi.fn()
  }

  public loadFile = vi.fn(() => Promise.resolve())
  public loadURL = vi.fn(() => Promise.resolve())
  public show = vi.fn()
  public focus = vi.fn()
  public minimize = vi.fn()
  public maximize = vi.fn()
  public unmaximize = vi.fn()
  public close = vi.fn()
  public restore = vi.fn()
  public getSize = vi.fn(() => [1200, 800] as const)
  public isDestroyed = vi.fn(() => false)
  public isMaximized = vi.fn(() => false)
  public isMinimized = vi.fn(() => false)
  public setSize = vi.fn()
  public setThumbarButtons = vi.fn()

  constructor(_options: unknown) {
    browserWindowInstances.push(this)
  }

  once(event: string, callback: (...args: unknown[]) => void) {
    this.events[`once:${event}`] = callback
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    this.events[event] = callback
  }
}

vi.mock('electron', () => ({
  app: {
    quit: appQuitMock
  },
  BrowserWindow: BrowserWindowMock,
  ipcMain: {
    on: ipcMainOn
  },
  nativeImage: {
    createFromPath: vi.fn((filePath: string) => filePath)
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 }
    }))
  }
}))

vi.mock('electron-store', () => ({
  default: class {
    get() {
      return undefined
    }

    set() {}
  }
}))

vi.mock('node:path', () => ({
  default: {
    join: (...segments: string[]) => segments.join('/')
  }
}))

vi.mock('../../electron/logger', () => ({
  default: {
    error: loggerError,
    info: vi.fn(),
    warn: loggerWarn
  }
}))

vi.mock('../../electron/DownloadManager', () => ({
  downloadManager: {
    init: initDownloadManagerMock,
    setWindow: setWindowMock
  }
}))

vi.mock('../../electron/utils/paths', () => ({
  MAIN_DIST: '/main',
  RENDERER_DIST: '/renderer',
  VITE_PUBLIC: '/public'
}))

describe('electron/WindowManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
    browserWindowInstances.length = 0
    delete process.env.VITE_DEV_SERVER_URL
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.VITE_DEV_SERVER_URL
  })

  it('retries the dev renderer after a main-frame load failure', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'

    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.loadURL).toHaveBeenCalledWith('http://localhost:5173')

    window?.webContentsEvents['did-fail-load']?.(
      {},
      -102,
      'ERR_CONNECTION_REFUSED',
      'http://localhost:5173',
      true
    )

    await vi.advanceTimersByTimeAsync(1000)

    expect(loggerError).toHaveBeenCalledWith('[WindowManager] Renderer load issue', {
      reason: 'did-fail-load',
      errorCode: -102,
      errorDescription: 'ERR_CONNECTION_REFUSED',
      validatedURL: 'http://localhost:5173'
    })
    expect(window?.loadURL).toHaveBeenCalledTimes(2)
  })

  it('retries the packaged renderer after an unexpected renderer crash', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.loadFile).toHaveBeenCalledWith('/renderer/index.html')

    window?.webContentsEvents['render-process-gone']?.({}, { reason: 'crashed', exitCode: 1 })

    await vi.advanceTimersByTimeAsync(1000)

    expect(loggerError).toHaveBeenCalledWith('[WindowManager] Renderer load issue', {
      reason: 'render-process-gone',
      processGoneReason: 'crashed',
      exitCode: 1
    })
    expect(window?.loadFile).toHaveBeenCalledTimes(2)
  })

  it('syncs playback state into tray menu visibility', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    const contextMenu = {
      items: [{ visible: true }, { visible: false }, {}, {}, { submenu: { items: [] } }]
    }

    manager.setTray({} as never, contextMenu as never)
    manager.syncPlaybackState(true)

    expect(contextMenu.items[0].visible).toBe(false)
    expect(contextMenu.items[1].visible).toBe(true)
  })

  it('syncs tray play mode checked state', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    const playModeItems = [{ checked: false }, { checked: false }, { checked: false }]
    const contextMenu = {
      items: [{}, {}, {}, {}, { submenu: { items: playModeItems } }]
    }

    manager.setTray({} as never, contextMenu as never)
    manager.syncTrayPlayMode(1)

    expect(playModeItems).toEqual([{ checked: false }, { checked: true }, { checked: false }])
  })

  it('quits the app after the main window is closed on non-macOS platforms', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()

    window?.events.closed?.()

    expect(appQuitMock).toHaveBeenCalledTimes(1)
  })
})
