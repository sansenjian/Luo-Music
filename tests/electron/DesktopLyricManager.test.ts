import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RECEIVE_CHANNELS } from '../../electron/shared/protocol/channels'

const storeData = new Map<string, unknown>()
const originalNodeEnv = process.env.NODE_ENV

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

type ManagerInternals = {
  win: {
    isDestroyed: () => boolean
    isDestroyedMock?: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    hide: ReturnType<typeof vi.fn>
    isVisible?: ReturnType<typeof vi.fn>
    webContents: { send: ReturnType<typeof vi.fn> }
  } | null
  isWindowReady: boolean
  isRendererReady: boolean
}

function setInternals(manager: DesktopLyricManager, patch: Partial<ManagerInternals>): void {
  Object.assign(manager as unknown as ManagerInternals, patch)
}

type DesktopLyricManager = import('../../electron/DesktopLyricManager').DesktopLyricManager

function createMockWindow(
  overrides: { isVisible?: boolean } = {}
): ManagerInternals['win'] & NonNullable<ManagerInternals['win']> {
  return {
    isDestroyed: vi.fn(() => false),
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => overrides.isVisible ?? false),
    webContents: { send: vi.fn() }
  }
}

describe('DesktopLyricManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storeData.clear()
    process.env.NODE_ENV = originalNodeEnv
    delete process.env.VITE_DEV_SERVER_URL
    delete process.env.LUO_DESKTOP_LYRIC_DEBUG
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
    const mockWindow = createMockWindow()

    manager.sendLyric(payload)
    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: true
    })

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
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
    const mockWindow = createMockWindow()

    manager.sendLyric(payload)
    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: false
    })

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
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
    const mockWindow = createMockWindow()

    manager.sendLyric(payload)
    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: false
    })

    manager.onRendererReady()

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
    expect((manager as unknown as ManagerInternals).isRendererReady).toBe(true)
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
    const mockWindow = createMockWindow()

    manager.sendLyric(payload)
    setInternals(manager, {
      win: mockWindow,
      isWindowReady: false,
      isRendererReady: false
    })

    manager.onRendererReady()

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    setInternals(manager, { isWindowReady: true })

    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(mockWindow.webContents.send).toHaveBeenNthCalledWith(
      1,
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
  })

  it('caches lyric updates for a hidden warm window until it is shown', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 18,
      index: 1,
      text: 'Cached while hidden',
      trans: '',
      roma: '',
      playing: true
    }
    const mockWindow = createMockWindow({ isVisible: false })

    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: false
    })

    manager.sendLyric(payload)

    expect(mockWindow.webContents.send).not.toHaveBeenCalled()

    mockWindow.isVisible!.mockReturnValue(true)
    manager.show()

    expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
    expect(mockWindow.show).toHaveBeenCalledTimes(1)
  })

  it('sends lock state through the whitelisted renderer channel', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const mockWindow = {
      ...createMockWindow(),
      setIgnoreMouseEvents: vi.fn()
    }

    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: true
    })

    manager.setLocked(true)

    expect(mockWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE,
      { locked: true }
    )

    manager.setLocked(false)

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.DESKTOP_LYRIC_LOCK_STATE,
      { locked: false }
    )
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

  it('emits debug traces for cached replay flow when desktop lyric debug is enabled', async () => {
    process.env.LUO_DESKTOP_LYRIC_DEBUG = '1'
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 36,
      index: 2,
      text: 'Warm line',
      trans: '',
      roma: '',
      playing: true,
      songId: 'song-1',
      platform: 'netease' as const,
      sequence: 4,
      cause: 'seek' as const
    }
    const mockWindow = createMockWindow({ isVisible: false })

    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: false
    })

    manager.sendLyric(payload)
    mockWindow.isVisible!.mockReturnValue(true)
    manager.show()

    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyricManager]',
      'cache-lyric-until-ready',
      expect.objectContaining({
        source: 'push',
        cause: 'seek',
        sequence: 4,
        songId: 'song-1'
      })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyricManager]',
      'replay-last-lyric',
      expect.objectContaining({
        source: 'push',
        cause: 'seek',
        sequence: 4,
        currentLyricIndex: 2
      })
    )
  })

  it('emits debug traces for cached replay flow in development mode without an explicit flag', async () => {
    process.env.NODE_ENV = 'development'
    process.env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173'
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 48,
      index: 3,
      text: 'Dev line',
      trans: '',
      roma: '',
      playing: true,
      songId: 'song-dev',
      platform: 'qq' as const,
      sequence: 5,
      cause: 'lyric-change' as const
    }
    const mockWindow = createMockWindow({ isVisible: false })

    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: false
    })

    manager.sendLyric(payload)
    mockWindow.isVisible!.mockReturnValue(true)
    manager.show()

    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyricManager]',
      'cache-lyric-until-ready',
      expect.objectContaining({
        source: 'push',
        cause: 'lyric-change',
        sequence: 5,
        songId: 'song-dev'
      })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[DesktopLyricManager]',
      'replay-last-lyric',
      expect.objectContaining({
        source: 'push',
        cause: 'lyric-change',
        sequence: 5,
        currentLyricIndex: 3
      })
    )
  })

  it('emits live lyric via the whitelisted channel when the window and renderer are ready', async () => {
    const { DesktopLyricManager } = await import('../../electron/DesktopLyricManager')
    const manager = new DesktopLyricManager()
    const payload = {
      time: 55,
      index: 4,
      text: 'Live line',
      trans: '',
      roma: '',
      playing: true
    }
    const mockWindow = createMockWindow()

    setInternals(manager, {
      win: mockWindow,
      isWindowReady: true,
      isRendererReady: true
    })

    manager.sendLyric(payload)

    expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      RECEIVE_CHANNELS.LYRIC_TIME_UPDATE,
      payload
    )
  })
})
