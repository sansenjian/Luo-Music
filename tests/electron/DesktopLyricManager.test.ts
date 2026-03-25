import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeData = new Map<string, unknown>()

vi.mock('electron-store', () => ({
  default: class {
    get(key: string): unknown {
      return storeData.get(key)
    }

    set(key: string, value: unknown): void {
      storeData.set(key, value)
    }
  }
}))

describe('DesktopLyricManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storeData.clear()
    delete process.env.VITE_DEV_SERVER_URL
  })

  it('replays the last cached lyric when an existing ready window is shown', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 42,
      index: 3,
      text: 'Current line',
      trans: 'Translated line',
      roma: 'roma',
      playing: true
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      webContents: {
        send: vi.fn()
      }
    }

    manager.sendLyric(payload)
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).win = mockWindow
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).isWindowReady = true
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).isRendererReady = true

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('lyric-time-update', payload)
    expect(mockWindow.show).toHaveBeenCalledTimes(1)
  })

  it('replays the last cached lyric when showing a warm window even without renderer ready flag', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 36,
      index: 2,
      text: 'Warm line',
      trans: '',
      roma: '',
      playing: true
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      webContents: {
        send: vi.fn()
      }
    }

    manager.sendLyric(payload)
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).win = mockWindow
    ;(
      manager as unknown as {
        isWindowReady: boolean
      }
    ).isWindowReady = true
    ;(
      manager as unknown as {
        isRendererReady: boolean
      }
    ).isRendererReady = false

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('lyric-time-update', payload)
    expect(mockWindow.show).toHaveBeenCalledTimes(1)
  })

  it('replays the cached lyric when the renderer reports readiness', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 24,
      index: 1,
      text: 'Mounted line',
      trans: '',
      roma: '',
      playing: false
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn()
      }
    }

    manager.sendLyric(payload)
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).win = mockWindow
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).isWindowReady = true

    manager.onRendererReady()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith('lyric-time-update', payload)
    expect(
      (
        manager as unknown as {
          isRendererReady: boolean
        }
      ).isRendererReady
    ).toBe(true)
  })

  it('waits for window ready before replaying cached lyric on renderer readiness', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 12,
      index: 0,
      text: 'Line',
      trans: '',
      roma: '',
      playing: true
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      webContents: {
        send: vi.fn()
      }
    }

    manager.sendLyric(payload)
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).win = mockWindow
    ;(
      manager as unknown as {
        win: typeof mockWindow
        isWindowReady: boolean
        isRendererReady: boolean
      }
    ).isWindowReady = false

    manager.onRendererReady()

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    ;(
      manager as unknown as {
        isWindowReady: boolean
      }
    ).isWindowReady = true

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(mockWindow.webContents.send).toHaveBeenNthCalledWith(1, 'lyric-time-update', payload)
  })

  it('builds the desktop lyric route target in development mode', async () => {
    const { DESKTOP_LYRIC_HASH_ROUTE, getDesktopLyricWindowRoute } =
      await import('../../electron/DesktopLyricManager')

    expect(DESKTOP_LYRIC_HASH_ROUTE).toBe('/desktop-lyric')
    expect(getDesktopLyricWindowRoute('http://127.0.0.1:5173')).toEqual({
      url: 'http://127.0.0.1:5173#/desktop-lyric'
    })
  })

  it('builds the desktop lyric route target in production mode', async () => {
    const { getDesktopLyricWindowRoute } = await import('../../electron/DesktopLyricManager')

    expect(getDesktopLyricWindowRoute(undefined)).toEqual({
      hash: '/desktop-lyric'
    })
  })
})
