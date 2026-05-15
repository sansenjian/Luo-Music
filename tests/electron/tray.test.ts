import { beforeEach, describe, expect, it, vi } from 'vitest'

const joinMock = vi.fn((...segments: string[]) => segments.join('/'))
const existsSyncMock = vi.fn<(path: string) => boolean>(() => false)
const appQuitMock = vi.fn()
const menuBuildFromTemplateMock = vi.fn((template: unknown) => ({ template }))
const traySetToolTipMock = vi.fn()
const traySetContextMenuMock = vi.fn()
const trayOnMock = vi.fn()
const trayDestroyMock = vi.fn()
const imageResizeMock = vi.fn((size: unknown) => ({ size }))

vi.mock('node:path', () => ({
  default: {
    join: joinMock
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: existsSyncMock
  }
}))

vi.mock('electron', () => ({
  app: {
    quit: appQuitMock
  },
  Tray: vi.fn().mockImplementation(function TrayMock() {
    return {
      setToolTip: traySetToolTipMock,
      setContextMenu: traySetContextMenuMock,
      on: trayOnMock,
      destroy: trayDestroyMock
    }
  }),
  Menu: {
    buildFromTemplate: menuBuildFromTemplateMock
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      resize: imageResizeMock
    }))
  }
}))

vi.mock('../../electron/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('../../electron/utils/paths', () => ({
  VITE_PUBLIC: '/mock/public',
  __dirname: '/mock/build/electron'
}))

describe('electron/main/tray', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(false)
    menuBuildFromTemplateMock.mockImplementation((template: unknown) => ({ template }))
  })

  it('prefers tray icons and falls back to favicon.svg', async () => {
    existsSyncMock.mockImplementation((input: string) => input.endsWith('/mock/public/favicon.svg'))

    const { getIconPath } = await import('../../electron/main/tray')

    expect(getIconPath()).toBe('/mock/public/favicon.svg')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/tray.ico')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/tray.png')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/favicon.svg')
  })

  it('marks the app as quitting before running the tray exit action', async () => {
    existsSyncMock.mockImplementation((input: string) => input.endsWith('/mock/public/tray.ico'))
    const markAppQuitting = vi.fn()

    const { createTray, setWindowManager } = await import('../../electron/main/tray')

    setWindowManager({
      show: vi.fn(),
      send: vi.fn(),
      setTray: vi.fn(),
      markAppQuitting
    })
    createTray()

    const template = menuBuildFromTemplateMock.mock.calls[0]?.[0] as Array<{
      label?: string
      click?: () => void
    }>
    const exitItem = template.find(item => item.label === '退出')

    exitItem?.click?.()

    expect(markAppQuitting).toHaveBeenCalledTimes(1)
    expect(appQuitMock).toHaveBeenCalledTimes(1)
    expect(markAppQuitting.mock.invocationCallOrder[0]).toBeLessThan(
      appQuitMock.mock.invocationCallOrder[0]
    )
  })
})
