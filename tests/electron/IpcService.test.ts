import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMainOnMock = vi.hoisted(() => vi.fn())
const ipcMainRemoveListenerMock = vi.hoisted(() => vi.fn())
const ipcMainHandleMock = vi.hoisted(() => vi.fn())
const ipcMainRemoveHandlerMock = vi.hoisted(() => vi.fn())
const getAllWindowsMock = vi.hoisted(() => vi.fn(() => []))
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: ipcMainOnMock,
    removeListener: ipcMainRemoveListenerMock,
    handle: ipcMainHandleMock,
    removeHandler: ipcMainRemoveHandlerMock
  },
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  }
}))

vi.mock('../../electron/logger', () => ({
  default: loggerMock
}))

describe('IpcService', () => {
  beforeEach(async () => {
    const { ipcService } = await import('../../electron/ipc/IpcService.ts')
    ipcService.dispose()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { ipcService } = await import('../../electron/ipc/IpcService.ts')
    ipcService.dispose()
  })

  it('replaces send listeners when a channel is re-registered and removes them on dispose', async () => {
    const [{ ipcService }, { SEND_CHANNELS }] = await Promise.all([
      import('../../electron/ipc/IpcService.ts'),
      import('../../electron/shared/protocol/channels.ts')
    ])

    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    ipcService.registerSend(SEND_CHANNELS.WINDOW_SHOW, firstHandler)
    ipcService.initialize()

    const firstWrapper = ipcMainOnMock.mock.calls.find(
      ([channel]) => channel === SEND_CHANNELS.WINDOW_SHOW
    )?.[1]

    expect(firstWrapper).toBeTypeOf('function')

    ipcService.registerSend(SEND_CHANNELS.WINDOW_SHOW, secondHandler)

    const windowShowRegistrations = ipcMainOnMock.mock.calls.filter(
      ([channel]) => channel === SEND_CHANNELS.WINDOW_SHOW
    )
    const secondWrapper = windowShowRegistrations[1]?.[1]

    expect(windowShowRegistrations).toHaveLength(2)
    expect(secondWrapper).toBeTypeOf('function')
    expect(secondWrapper).not.toBe(firstWrapper)
    expect(ipcMainRemoveListenerMock).toHaveBeenCalledWith(
      SEND_CHANNELS.WINDOW_SHOW,
      firstWrapper
    )

    await secondWrapper?.({} as never)

    expect(secondHandler).toHaveBeenCalledTimes(1)
    expect(firstHandler).not.toHaveBeenCalled()

    ipcService.dispose()

    expect(ipcMainRemoveListenerMock).toHaveBeenCalledWith(
      SEND_CHANNELS.WINDOW_SHOW,
      secondWrapper
    )
  })
})
