import { beforeEach, describe, expect, it, vi } from 'vitest'

type AppLifecycleCallbacks = {
  onActivate?: () => void
  onReady?: () => Promise<void> | void
  onSecondInstance?: () => void
  onWillQuit?: () => Promise<void> | void
  onWindowAllClosed?: () => Promise<void> | void
}

const createWindowMock = vi.hoisted(() => vi.fn())
const getWindowMock = vi.hoisted(() => vi.fn())
const restoreWindowMock = vi.hoisted(() => vi.fn())
const createTrayMock = vi.hoisted(() => vi.fn())
const registerShortcutsMock = vi.hoisted(() => vi.fn())
const initializeServicesMock = vi.hoisted(() => vi.fn())
const getAllServiceStatusMock = vi.hoisted(() => vi.fn(() => ({ qq: { status: 'running' } })))
const stopAllServicesMock = vi.hoisted(() => vi.fn(async () => {}))
const prewarmWindowMock = vi.hoisted(() => vi.fn())
const closeDesktopLyricWindowMock = vi.hoisted(() => vi.fn())
const registerAppLifecycleMock = vi.hoisted(() => vi.fn())
const loggerInfoMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const initSentryMock = vi.hoisted(() => vi.fn(async () => {}))
const requestSingleInstanceLockMock = vi.hoisted(() => vi.fn())
const setupDevUserDataMock = vi.hoisted(() => vi.fn())
const setupErrorHandlersMock = vi.hoisted(() => vi.fn())
const setTrayWindowManagerMock = vi.hoisted(() => vi.fn())
const destroyTrayMock = vi.hoisted(() => vi.fn())
const setShortcutsWindowManagerMock = vi.hoisted(() => vi.fn())
const unregisterAllShortcutsMock = vi.hoisted(() => vi.fn())
const ipcConfigureMock = vi.hoisted(() => vi.fn())
const ipcUseMock = vi.hoisted(() => vi.fn())
const ipcInitializeMock = vi.hoisted(() => vi.fn())
const disposePerformanceMonitorMock = vi.hoisted(() => vi.fn())
const performanceMiddlewareMock = vi.hoisted(() => Symbol('performanceMiddleware'))
const registerWindowHandlersMock = vi.hoisted(() => vi.fn())
const registerCacheHandlersMock = vi.hoisted(() => vi.fn())
const registerConfigHandlersMock = vi.hoisted(() => vi.fn())
const registerPlayerHandlersMock = vi.hoisted(() => vi.fn())
const registerServiceHandlersMock = vi.hoisted(() => vi.fn())
const registerApiHandlersMock = vi.hoisted(() => vi.fn())
const registerLyricHandlersMock = vi.hoisted(() => vi.fn())
const registerLogHandlersMock = vi.hoisted(() => vi.fn())

let lifecycleCallbacks: AppLifecycleCallbacks | undefined
let resolveInitializeServices: (() => void) | undefined
let serviceWarmupResolved = false

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('../../electron/DesktopLyricManager', () => ({
  desktopLyricManager: {
    prewarmWindow: prewarmWindowMock,
    closeWindow: closeDesktopLyricWindowMock
  }
}))

vi.mock('../../electron/DownloadManager', () => ({
  downloadManager: {
    dispose: vi.fn()
  }
}))

vi.mock('../../electron/WindowManager', () => ({
  windowManager: {
    createWindow: createWindowMock,
    getWindow: getWindowMock,
    restore: restoreWindowMock
  }
}))

vi.mock('../../electron/logger', () => ({
  default: {
    log: vi.fn(),
    error: loggerErrorMock,
    warn: vi.fn(),
    info: loggerInfoMock
  },
  initSentry: initSentryMock
}))

vi.mock('../../electron/ServiceManager', () => ({
  serviceManager: {
    initialize: initializeServicesMock,
    getAllServiceStatus: getAllServiceStatusMock,
    stopAllServices: stopAllServicesMock
  }
}))

vi.mock('../../electron/utils/paths', () => ({
  RENDERER_DIST: 'renderer-dist',
  VITE_PUBLIC: 'vite-public'
}))

vi.mock('../../electron/ipc/index', () => ({
  ipcService: {
    configure: ipcConfigureMock,
    use: ipcUseMock,
    initialize: ipcInitializeMock,
    dispose: vi.fn()
  },
  disposePerformanceMonitor: disposePerformanceMonitorMock,
  errorMiddleware: Symbol('errorMiddleware'),
  loggerMiddleware: Symbol('loggerMiddleware'),
  performanceMiddleware: performanceMiddlewareMock,
  registerWindowHandlers: registerWindowHandlersMock,
  registerCacheHandlers: registerCacheHandlersMock,
  registerConfigHandlers: registerConfigHandlersMock,
  registerPlayerHandlers: registerPlayerHandlersMock,
  registerServiceHandlers: registerServiceHandlersMock,
  registerApiHandlers: registerApiHandlersMock,
  registerLyricHandlers: registerLyricHandlersMock,
  registerLogHandlers: registerLogHandlersMock
}))

vi.mock('../../electron/main/app', () => ({
  requestSingleInstanceLock: requestSingleInstanceLockMock,
  setupDevUserData: setupDevUserDataMock,
  setupErrorHandlers: setupErrorHandlersMock,
  registerAppLifecycle: registerAppLifecycleMock.mockImplementation(callbacks => {
    lifecycleCallbacks = callbacks
  })
}))

vi.mock('../../electron/main/tray', () => ({
  createTray: createTrayMock,
  destroyTray: destroyTrayMock,
  setWindowManager: setTrayWindowManagerMock
}))

vi.mock('../../electron/main/shortcuts', () => ({
  registerShortcuts: registerShortcutsMock,
  unregisterAllShortcuts: unregisterAllShortcutsMock,
  setWindowManager: setShortcutsWindowManagerMock
}))

vi.mock('../../src/config/shortcuts', () => ({
  DEFAULT_SHORTCUTS: [{ key: 'Ctrl+Shift+L' }]
}))

vi.mock('../../electron/shared/protocol/cache', () => ({
  NETEASE_API_PORT: 14532,
  QQ_API_PORT: 3200
}))

describe('electron/main/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    lifecycleCallbacks = undefined
    serviceWarmupResolved = false
    resolveInitializeServices = undefined

    getWindowMock.mockReturnValue({
      webContents: {
        once: vi.fn()
      }
    })

    initializeServicesMock.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveInitializeServices = () => {
            serviceWarmupResolved = true
            resolve()
          }
        })
    )
  })

  it('registers lifecycle handlers on module bootstrap', async () => {
    await import('../../electron/main/index.ts')

    expect(requestSingleInstanceLockMock).toHaveBeenCalledTimes(1)
    expect(setupDevUserDataMock).toHaveBeenCalledTimes(1)
    expect(setupErrorHandlersMock).toHaveBeenCalledTimes(1)
    expect(initSentryMock).toHaveBeenCalledTimes(1)
    expect(setTrayWindowManagerMock).toHaveBeenCalledTimes(1)
    expect(setShortcutsWindowManagerMock).toHaveBeenCalledTimes(1)
    expect(registerAppLifecycleMock).toHaveBeenCalledTimes(1)
    expect(lifecycleCallbacks?.onReady).toBeTypeOf('function')
  })

  it('waits for service warmup before creating the window', async () => {
    await import('../../electron/main/index.ts')

    const readyPromise = lifecycleCallbacks?.onReady?.()

    expect(initializeServicesMock).toHaveBeenCalledTimes(1)
    expect(createWindowMock).not.toHaveBeenCalled()
    expect(serviceWarmupResolved).toBe(false)

    resolveInitializeServices?.()
    await readyPromise

    expect(getAllServiceStatusMock).toHaveBeenCalledTimes(1)
    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(createTrayMock).toHaveBeenCalledTimes(1)
    expect(registerShortcutsMock).toHaveBeenCalledTimes(1)
    expect(initializeServicesMock.mock.invocationCallOrder[0]).toBeLessThan(
      createWindowMock.mock.invocationCallOrder[0]
    )
  })

  it('cleans up desktop lyric window and tray when the app quits', async () => {
    await import('../../electron/main/index.ts')

    await lifecycleCallbacks?.onWillQuit?.()

    expect(unregisterAllShortcutsMock).toHaveBeenCalledTimes(1)
    expect(closeDesktopLyricWindowMock).toHaveBeenCalledTimes(1)
    expect(destroyTrayMock).toHaveBeenCalledTimes(1)
    expect(stopAllServicesMock).toHaveBeenCalledTimes(1)
    expect(disposePerformanceMonitorMock).toHaveBeenCalledTimes(1)
  })
})
