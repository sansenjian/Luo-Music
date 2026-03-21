import { beforeEach, describe, expect, it, vi } from 'vitest'

const joinMock = vi.fn((...segments: string[]) => segments.join('/'))
const existsSyncMock = vi.fn<(path: string) => boolean>(() => false)

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
  Tray: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn()
  },
  nativeImage: {
    createFromPath: vi.fn()
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
  })

  it('prefers tray icons and falls back to favicon.svg', async () => {
    existsSyncMock.mockImplementation((input: string) => input.endsWith('/mock/public/favicon.svg'))

    const { getIconPath } = await import('../../electron/main/tray')

    expect(getIconPath()).toBe('/mock/public/favicon.svg')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/tray.ico')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/tray.png')
    expect(existsSyncMock).toHaveBeenCalledWith('/mock/public/favicon.svg')
  })
})
