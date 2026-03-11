import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMainOn = vi.fn()
const ipcMainHandle = vi.fn()
const getWindowMock = vi.fn()
const sendMock = vi.fn()

// 模拟 electron 模块
vi.mock('electron', () => ({
  ipcMain: {
    on: ipcMainOn,
    handle: ipcMainHandle
  },
  app: {
    isPackaged: false,
    getVersion: () => '1.0.0'
  }
}))

vi.mock('../../electron/WindowManager', () => ({
  windowManager: {
    getWindow: getWindowMock,
    send: sendMock
  }
}))

vi.mock('../../electron/ServiceManager', () => ({
  serviceManager: {
    handleRequest: vi.fn(),
    getAvailableServices: vi.fn(() => ['netease', 'qq']),
    getServiceStatus: vi.fn(() => ({ running: false, pid: null, port: 3000, name: 'test' })),
    startService: vi.fn(),
    stopService: vi.fn()
  }
}))

describe('electron/ipc', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('应为每个播放器通道注册 ipcMain 监听器', async () => {
    const { PLAYER_CHANNELS, initPlayerIPC } = await import('../../electron/ipc')

    initPlayerIPC()

    expect(ipcMainOn).toHaveBeenCalledTimes(PLAYER_CHANNELS.length)
    expect(ipcMainOn.mock.calls.map(([channel]) => channel)).toEqual(PLAYER_CHANNELS)
  })

  it('消息来自非主窗口时应转发给主窗口', async () => {
    const { initPlayerIPC } = await import('../../electron/ipc')
    const mainWindow = { webContents: { id: 100 } }
    getWindowMock.mockReturnValue(mainWindow)

    initPlayerIPC()

    const [, handler] = ipcMainOn.mock.calls.find(([channel]) => channel === 'music-song-control') || []
    expect(handler).toBeTypeOf('function')

    handler({ sender: { id: 200 } }, 'next', { source: 'tray' })

    expect(sendMock).toHaveBeenCalledWith('music-song-control', 'next', { source: 'tray' })
  })

  it('消息来自主窗口自身时不应重复转发', async () => {
    const { initPlayerIPC } = await import('../../electron/ipc')
    getWindowMock.mockReturnValue({ webContents: { id: 300 } })

    initPlayerIPC()

    const [, handler] = ipcMainOn.mock.calls.find(([channel]) => channel === 'music-volume-up') || []
    expect(handler).toBeTypeOf('function')

    handler({ sender: { id: 300 } }, 1)

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('主窗口不存在时仍应尝试转发，避免消息丢失', async () => {
    const { initPlayerIPC } = await import('../../electron/ipc')
    getWindowMock.mockReturnValue(null)

    initPlayerIPC()

    const [, handler] = ipcMainOn.mock.calls.find(([channel]) => channel === 'hide-player') || []
    expect(handler).toBeTypeOf('function')

    handler({ sender: { id: 1 } })

    expect(sendMock).toHaveBeenCalledWith('hide-player')
  })
})
