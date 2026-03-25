import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerInvokeMock = vi.hoisted(() => vi.fn())
const registerSendMock = vi.hoisted(() => vi.fn())

vi.mock('../../electron/ipc/IpcService', () => ({
  ipcService: {
    registerInvoke: registerInvokeMock,
    registerSend: registerSendMock
  }
}))

vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 }
    }))
  }
}))

describe('window.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers and handles the expanded window IPC surface', async () => {
    const invokeHandlers = new Map<string, (...args: unknown[]) => unknown>()
    const sendHandlers = new Map<string, (...args: unknown[]) => unknown>()
    registerInvokeMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      invokeHandlers.set(channel, handler)
    })
    registerSendMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      sendHandlers.set(channel, handler)
    })

    const manager = {
      getWindow: vi.fn(() => ({
        getSize: vi.fn(() => [1280, 720]),
        isMaximized: vi.fn(() => true),
        isMinimized: vi.fn(() => false),
        setSize: vi.fn()
      })),
      getWindowState: vi.fn(() => ({
        isMaximized: true,
        isMinimized: false,
        isFullScreen: false,
        isAlwaysOnTop: true
      })),
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      minimizeToTray: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      toggleFullScreen: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      hide: vi.fn()
    }

    const { registerWindowHandlers } = await import('../../electron/ipc/handlers/window.handler')
    registerWindowHandlers(manager as never)

    await expect(invokeHandlers.get('window:get-state')?.()).resolves.toEqual({
      isMaximized: true,
      isMinimized: false,
      isFullScreen: false,
      isAlwaysOnTop: true
    })

    sendHandlers.get('minimize-to-tray')?.()
    sendHandlers.get('set-always-on-top')?.(true)
    sendHandlers.get('toggle-fullscreen')?.()
    sendHandlers.get('restore-window')?.()
    sendHandlers.get('show-window')?.()
    sendHandlers.get('hide-window')?.()

    expect(manager.minimizeToTray).toHaveBeenCalledTimes(1)
    expect(manager.setAlwaysOnTop).toHaveBeenCalledWith(true)
    expect(manager.toggleFullScreen).toHaveBeenCalledTimes(1)
    expect(manager.restore).toHaveBeenCalledTimes(1)
    expect(manager.show).toHaveBeenCalledTimes(1)
    expect(manager.hide).toHaveBeenCalledTimes(1)
  })
})
