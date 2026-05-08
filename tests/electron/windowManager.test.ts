import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const browserWindowInstances: BrowserWindowMock[] = []
const ipcMainOn = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()
const setWindowMock = vi.fn()
const initDownloadManagerMock = vi.fn()
const appQuitMock = vi.fn()

class BrowserWindowMock {
  public options: unknown
  public events: Record<string, (...args: unknown[]) => void> = {}
  public webContentsEvents: Record<string, (...args: unknown[]) => void> = {}
  public webContents = {
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      this.webContentsEvents[event] = callback
    }),
    isDestroyed: vi.fn(() => false),
    getURL: vi.fn(() => 'http://localhost:5173'),
    isDevToolsOpened: vi.fn(() => false),
    openDevTools: vi.fn(),
    send: vi.fn()
  }

  public visible = false
  public loadFile = vi.fn(() => Promise.resolve())
  public loadURL = vi.fn(() => Promise.resolve())
  public show = vi.fn(() => {
    this.visible = true
  })
  public focus = vi.fn()
  public minimize = vi.fn()
  public maximize = vi.fn()
  public unmaximize = vi.fn()
  public close = vi.fn()
  public restore = vi.fn()
  public getSize = vi.fn(() => [1200, 800] as const)
  public isDestroyed = vi.fn(() => false)
  public isVisible = vi.fn(() => this.visible)
  public isMaximized = vi.fn(() => false)
  public isMinimized = vi.fn(() => false)
  public setAppDetails = vi.fn()
  public setSize = vi.fn()
  public setThumbarButtons = vi.fn()

  constructor(options: unknown) {
    this.options = options
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
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
    browserWindowInstances.length = 0
    delete process.env.VITE_DEV_SERVER_URL
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.VITE_DEV_SERVER_URL
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })

  it('keeps the frameless main window flush on Windows', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.options).toMatchObject({
      roundedCorners: false,
      thickFrame: false
    })
  })

  it('uses an opaque background so startup stalls do not show a blank transparent shell', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window?.options).toMatchObject({
      transparent: false,
      backgroundColor: '#101014'
    })
  })

  it('sets Windows app details on the main window for shell and SMTC identity', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window?.setAppDetails).toHaveBeenCalledWith({
      appId: 'com.sansenjian.luo-music',
      appIconPath: '/public/tray.ico',
      appIconIndex: 0,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'LUO Music'
    })
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

  it('shows the dev window once the renderer DOM is ready', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'

    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.show).not.toHaveBeenCalled()

    window?.webContentsEvents['dom-ready']?.()

    expect(window?.show).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3000)

    expect(window?.show).toHaveBeenCalledTimes(1)
  })

  it('opens devtools only after the dev renderer has finished loading', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'

    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.webContents.openDevTools).not.toHaveBeenCalled()

    window?.webContentsEvents['did-finish-load']?.()

    expect(window?.webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' })
  })

  it('does not reopen devtools if the developer already opened it', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'

    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    window?.webContents.isDevToolsOpened.mockReturnValue(true)

    window?.webContentsEvents['did-finish-load']?.()

    expect(window?.webContents.openDevTools).not.toHaveBeenCalled()
  })

  it('does not open devtools for the packaged renderer', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()

    window?.webContentsEvents['did-finish-load']?.()

    expect(window?.webContents.openDevTools).not.toHaveBeenCalled()
  })

  it('ignores late renderer load events after the main window is destroyed', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()

    window?.isDestroyed.mockReturnValue(true)
    window?.webContents.isDestroyed.mockReturnValue(true)
    window?.webContents.getURL.mockImplementation(() => {
      throw new Error('Object has been destroyed')
    })

    expect(() => window?.webContentsEvents['did-finish-load']?.()).not.toThrow()
    expect(window?.webContents.send).not.toHaveBeenCalledWith(
      'main-process-message',
      expect.any(String)
    )
  })

  it('retries the renderer instead of showing a blank window when readiness stalls', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.show).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)

    expect(window?.show).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      '[WindowManager] Renderer readiness stalled before first show; retrying load',
      {
        elapsed: '3.00s',
        loadTarget: '/renderer/index.html'
      }
    )
    expect(loggerError).toHaveBeenCalledWith('[WindowManager] Renderer load issue', {
      reason: 'startup-renderer-stall',
      loadTarget: '/renderer/index.html'
    })

    await vi.advanceTimersByTimeAsync(1000)

    expect(window?.loadFile).toHaveBeenCalledTimes(2)
  })

  it('keeps waiting for the dev renderer instead of reloading during slow first compilation', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'

    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(window?.show).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30000)

    expect(window?.show).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      '[WindowManager] Dev renderer is still compiling before first show',
      {
        elapsed: '30.0s',
        loadTarget: 'http://localhost:5173'
      }
    )
    expect(loggerError).not.toHaveBeenCalledWith('[WindowManager] Renderer load issue', {
      reason: 'startup-renderer-stall',
      loadTarget: 'http://localhost:5173'
    })
    expect(window?.loadURL).toHaveBeenCalledTimes(1)
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

  it('does not quit the app from the closed handler (exit is handled centrally)', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()

    window?.events.closed?.()

    expect(appQuitMock).not.toHaveBeenCalled()
  })

  it('releases the download manager window reference when the main window closes', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()
    expect(setWindowMock).toHaveBeenCalledWith(window)

    window?.events.closed?.()

    expect(setWindowMock).toHaveBeenLastCalledWith(null)
  })

  it('clears the startup fallback timer when the main window closes before it fires', async () => {
    const { WindowManager } = await import('../../electron/WindowManager')
    const manager = new WindowManager()
    manager.createWindow()

    const window = browserWindowInstances.at(-1)
    expect(window).toBeDefined()

    window?.events.closed?.()
    await vi.advanceTimersByTimeAsync(3000)

    expect(window?.show).not.toHaveBeenCalled()
  })
})
